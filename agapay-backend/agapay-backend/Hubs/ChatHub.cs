using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services;
using agapay_backend.Services.Chat;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;

namespace agapay_backend.Hubs
{
  [Authorize]
  public class ChatHub : Hub
  {
    private readonly agapayDbContext _context;
    private readonly IRateLimiter _rateLimiter;
    private readonly IChatMessageMapper _messageMapper;

    public ChatHub(agapayDbContext context, IRateLimiter rateLimiter, IChatMessageMapper messageMapper)
    {
      _context = context;
      _rateLimiter = rateLimiter;
      _messageMapper = messageMapper;
    }

    public class SendMessageRequest
    {
      public string? ReceiverId { get; set; }
      public string? Content { get; set; }
      public string? ImagePath { get; set; }
      public string? MessageType { get; set; }
    }

    public async Task SendMessage(SendMessageRequest payload)
    {
      var senderId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
      if (string.IsNullOrEmpty(senderId) || !Guid.TryParse(senderId, out var senderGuid))
      {
        // This should not happen for an authorized user
        return;
      }

      if (payload == null || string.IsNullOrEmpty(payload.ReceiverId))
      {
        return;
      }

      if (!Guid.TryParse(payload.ReceiverId, out var receiverGuid))
      {
        // Handle invalid receiverId format
        return;
      }

      var content = payload.Content?.Trim();
      var imagePath = payload.ImagePath?.Trim();
      var rawType = payload.MessageType?.Trim()?.ToUpperInvariant();
      string messageType;

      switch (rawType)
      {
        case "IMAGE":
          messageType = "IMAGE";
          break;
        case "PROPOSAL":
          messageType = "PROPOSAL";
          break;
        default:
          messageType = "TEXT";
          break;
      }

      if (string.Equals(messageType, "TEXT", StringComparison.OrdinalIgnoreCase) ||
          string.Equals(messageType, "PROPOSAL", StringComparison.OrdinalIgnoreCase))
      {
        if (string.IsNullOrWhiteSpace(content))
        {
          return;
        }
      }
      else if (string.Equals(messageType, "IMAGE", StringComparison.OrdinalIgnoreCase))
      {
        if (string.IsNullOrWhiteSpace(imagePath))
        {
          return;
        }
      }

      if (!_rateLimiter.TryAcquire($"chat:{senderGuid}", 30, TimeSpan.FromMinutes(1), out var retryAfter))
      {
        await Clients.User(senderId).SendAsync("MessageRejected", new
        {
          reason = "rate_limited",
          receiverId = payload.ReceiverId,
          retryAfter = retryAfter.TotalSeconds
        });
        return;
      }

      var now = DateTime.UtcNow;

      var activeBlocks = await _context.Blocks
          .Where(b =>
              ((b.BlockerUserId == senderGuid && b.BlockedUserId == receiverGuid) ||
               (b.BlockerUserId == receiverGuid && b.BlockedUserId == senderGuid)) &&
              (b.ExpiresAt == null || b.ExpiresAt > now))
          .ToListAsync();

      var blockedBySender = activeBlocks.Any(b => b.BlockerUserId == senderGuid && b.BlockedUserId == receiverGuid);
      var blockedByReceiver = activeBlocks.Any(b => b.BlockerUserId == receiverGuid && b.BlockedUserId == senderGuid);

      if (blockedBySender || blockedByReceiver)
      {
        await Clients.User(senderId).SendAsync("MessageRejected", new
        {
          reason = blockedBySender ? "blocked_by_you" : "blocked_by_other",
          receiverId = payload.ReceiverId
        });
        return;
      }

      var conversation = await GetOrCreateConversationAsync(senderGuid, receiverGuid);

      if (string.Equals(conversation.Status, "Closed", StringComparison.OrdinalIgnoreCase))
      {
        await Clients.User(senderId).SendAsync("MessageRejected", new
        {
          reason = "conversation_closed",
          receiverId = payload.ReceiverId
        });
        return;
      }

      var chatMessage = new ChatMessage
      {
        ConversationId = conversation.Id,
        SenderId = senderGuid,
        ReceiverId = receiverGuid,
        Content = content ?? string.Empty,
        ImagePath = imagePath,
        MessageType = messageType,
        Timestamp = now
      };

      conversation.UpdatedAt = chatMessage.Timestamp;

      await _context.ChatMessages.AddAsync(chatMessage);
      await _context.SaveChangesAsync();

      // Try to enrich with active patient context if sender is a Patient
      var patientContext = await PatientContextEnricher.BuildPatientContextAsync(_context, senderGuid);

      var viewModel = await _messageMapper.ToViewModelAsync(
          chatMessage,
          senderGuid,
          patientContext,
          Context.ConnectionAborted);

      await Clients.Users(new[] { senderId, payload.ReceiverId }).SendAsync("ReceiveMessage", viewModel);
    }

    /// <summary>
    /// Keepalive ping method to prevent connection timeout on Render free tier (60s WebSocket timeout).
    /// Clients invoke this every 30 seconds to keep the connection alive.
    /// </summary>
    public Task Ping()
    {
      // Do nothing, just acknowledge the ping
      return Task.CompletedTask;
    }

    /// <summary>
    /// Patient explicitly shares their active patient context with the other user (therapist) for session details.
    /// If no active patient exists, a null payload is sent so clients can clear any cached context.
    /// </summary>
    /// <param name="otherUserId">The other user's Guid string.</param>
    public async Task SharePatientContext(string otherUserId)
    {
      var senderId = Context.User?.FindFirstValue(ClaimTypes.NameIdentifier);
      if (string.IsNullOrWhiteSpace(senderId) || !Guid.TryParse(senderId, out var senderGuid))
      {
        return;
      }

      if (string.IsNullOrWhiteSpace(otherUserId) || !Guid.TryParse(otherUserId, out var otherGuid))
      {
        return;
      }

      // Only patients can share patient context
      try
      {
        var isPatient = await _context.UserRoles
            .Join(_context.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
            .AnyAsync(x => x.UserId == senderGuid && x.Name == "Patient");

        if (!isPatient)
        {
          return;
        }

        object? patientContext = null;
        var patient = await _context.Patients
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.UserId == senderGuid && p.IsActive);
        if (patient != null)
        {
          patientContext = new
          {
            id = patient.Id,
            firstName = patient.FirstName,
            lastName = patient.LastName,
            dateOfBirth = patient.DateOfBirth,
            relationshipToUser = patient.RelationshipToUser,
            address = patient.Address,
            barangay = patient.Barangay,
            latitude = patient.Latitude,
            longitude = patient.Longitude,
            occupation = patient.Occupation,
            activityLevel = patient.ActivityLevel,
            currentComplaints = patient.CurrentComplaints
          };
        }

        // Send to the therapist and echo to sender so both can update UI state
        await Clients.Users(new[] { otherUserId, senderId }).SendAsync("PatientContextUpdated", patientContext);
      }
      catch
      {
        // swallow errors; do not disrupt connection
      }
    }

    private async Task<Conversation> GetOrCreateConversationAsync(Guid senderId, Guid receiverId)
    {
      var (first, second) = NormalizeParticipants(senderId, receiverId);

      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);

      if (conversation != null)
      {
        return conversation;
      }

      conversation = new Conversation
      {
        ParticipantAId = first,
        ParticipantBId = second,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
      };

      _context.Conversations.Add(conversation);

      try
      {
        await _context.SaveChangesAsync();
        return conversation;
      }
      catch (DbUpdateException)
      {
        _context.Entry(conversation).State = EntityState.Detached;
        return await _context.Conversations
            .FirstAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);
      }
    }

    private static (Guid First, Guid Second) NormalizeParticipants(Guid senderId, Guid receiverId)
    {
      return senderId.CompareTo(receiverId) <= 0
          ? (senderId, receiverId)
          : (receiverId, senderId);
    }
  }
}
