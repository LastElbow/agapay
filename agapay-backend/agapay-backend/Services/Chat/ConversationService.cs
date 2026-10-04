using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Chat
{
  /// <summary>
  /// Conversation logic extracted verbatim from ChatController (including the
  /// user-report endpoint, which lives with conversations because it reports a
  /// conversation/message). Responses are returned as ChatActionResult records;
  /// the controller maps them back to the original IActionResult types.
  /// </summary>
  public class ConversationService : IConversationService
  {
    private readonly agapayDbContext _context;
    private readonly ISupabaseStorageService _storageService;
    private readonly IChatMessageMapper _messageMapper;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly IRateLimiter _rateLimiter;
    private readonly ILogger<ConversationService> _logger;

    public ConversationService(
      agapayDbContext context,
      ISupabaseStorageService storageService,
      IChatMessageMapper messageMapper,
      IRealtimeNotifier realtimeNotifier,
      IRateLimiter rateLimiter,
      ILogger<ConversationService> logger
    )
    {
      _context = context;
      _storageService = storageService;
      _messageMapper = messageMapper;
      _realtimeNotifier = realtimeNotifier;
      _rateLimiter = rateLimiter;
      _logger = logger;
    }

    /// <summary>
    /// Clears all messages in a conversation but keeps the conversation record.
    /// Users can continue messaging each other after clearing (like Facebook Messenger).
    /// </summary>
    // DELETE api/Chat/conversations/{otherUserId} (body moved from ChatController.DeleteConversation)
    public async Task<ChatActionResult> DeleteConversationAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot delete a conversation with yourself.");
      }

      var (first, second) = NormalizeParticipants(currentUserGuid, otherUserGuid);

      // Find the conversation
      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);

      if (conversation == null)
      {
        // No conversation exists, nothing to delete
        return new ChatActionResult(204, null);
      }

      // Set the "cleared at" timestamp for the current user only
      // Messages before this timestamp will be hidden for this user but still visible to the other user
      var clearedAt = DateTime.UtcNow;
      if (currentUserGuid == conversation.ParticipantAId)
      {
        conversation.ClearedAtByParticipantA = clearedAt;
      }
      else
      {
        conversation.ClearedAtByParticipantB = clearedAt;
      }

      conversation.UpdatedAt = clearedAt;

      await _context.SaveChangesAsync();

      _logger.LogInformation(
        "User {UserId} cleared their chat history in conversation {ConversationId} with {OtherUserId}.",
        currentUserGuid,
        conversation.Id,
        otherUserGuid
      );

      // Only notify the current user that they cleared their history
      await _realtimeNotifier.SendToUserAsync(RealtimeHub.Chat, currentUserGuid.ToString(), SignalREvents.ConversationCleared, new
      {
        conversationId = conversation.Id,
        clearedByUserId = currentUserGuid,
        otherUserId = otherUserGuid,
        clearedAt
      });

      return new ChatActionResult(200, new
      {
        conversationId = conversation.Id,
        message = "Chat history has been cleared for you. The other user can still see their messages."
      });
    }


    // POST api/Chat/conversations/{otherUserId}/end (body moved from ChatController.EndConversation)
    public async Task<ChatActionResult> EndConversationAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot close a conversation with yourself.");
      }

      var otherExists = await _context.Users.AnyAsync(u => u.Id == otherUserGuid);
      if (!otherExists)
      {
        return new ChatActionResult(404, "The specified user does not exist.");
      }

      var (first, second) = NormalizeParticipants(currentUserGuid, otherUserGuid);
      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);

      if (conversation == null)
      {
        conversation = new Conversation
        {
          ParticipantAId = first,
          ParticipantBId = second,
          CreatedAt = DateTime.UtcNow,
          UpdatedAt = DateTime.UtcNow
        };

        _context.Conversations.Add(conversation);
        await _context.SaveChangesAsync();
      }

      if (conversation.Status == "Closed")
      {
        return new ChatActionResult(200, new
        {
          conversationId = conversation.Id,
          status = conversation.Status,
          closedAt = conversation.ClosedAt,
          closedByUserId = conversation.ClosedByUserId
        });
      }

      var now = DateTime.UtcNow;
      conversation.Status = "Closed";
      conversation.ClosedAt = now;
      conversation.ClosedByUserId = currentUserGuid;
      conversation.UpdatedAt = now;
      await _context.SaveChangesAsync();

      var payload = new
      {
        conversationId = conversation.Id,
        otherUserId = otherUserGuid,
        status = conversation.Status,
        closedAt = conversation.ClosedAt,
        closedByUserId = conversation.ClosedByUserId
      };

      _logger.LogInformation(
        "User {UserId} closed conversation {ConversationId} with {OtherUserId}",
        currentUserGuid,
        conversation.Id,
        otherUserGuid
      );

      await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Chat, new[] { currentUserGuid.ToString(), otherUserGuid.ToString() }, SignalREvents.ConversationClosed, new
      {
        initiatorUserId = currentUserGuid,
        otherUserId = otherUserGuid,
        closedAt = conversation.ClosedAt,
        closedByUserId = conversation.ClosedByUserId
      });

      return new ChatActionResult(200, payload);
    }

    // POST api/Chat/conversations/{otherUserId}/reopen (body moved from ChatController.ReopenConversation)
    public async Task<ChatActionResult> ReopenConversationAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot reopen a conversation with yourself.");
      }

      var otherExists = await _context.Users.AnyAsync(u => u.Id == otherUserGuid);
      if (!otherExists)
      {
        return new ChatActionResult(404, "The specified user does not exist.");
      }

      var (first, second) = NormalizeParticipants(currentUserGuid, otherUserGuid);
      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);

      if (conversation == null)
      {
        conversation = new Conversation
        {
          ParticipantAId = first,
          ParticipantBId = second,
          CreatedAt = DateTime.UtcNow,
          UpdatedAt = DateTime.UtcNow,
          Status = "Active"
        };

        _context.Conversations.Add(conversation);
        await _context.SaveChangesAsync();
      }

      var now = DateTime.UtcNow;
      conversation.Status = "Active";
      conversation.ClosedAt = null;
      conversation.ClosedByUserId = null;
      conversation.UpdatedAt = now;
      await _context.SaveChangesAsync();

      var payload = new
      {
        conversationId = conversation.Id,
        otherUserId = otherUserGuid,
        status = conversation.Status
      };

      _logger.LogInformation(
        "User {UserId} reopened conversation {ConversationId} with {OtherUserId}",
        currentUserGuid,
        conversation.Id,
        otherUserGuid
      );

      await _realtimeNotifier.SendToUsersAsync(RealtimeHub.Chat, new[] { currentUserGuid.ToString(), otherUserGuid.ToString() }, SignalREvents.ConversationReopened, new
      {
        initiatorUserId = currentUserGuid,
        otherUserId = otherUserGuid,
        reopenedAt = now
      });

      return new ChatActionResult(200, payload);
    }

    // POST api/Chat/report (body moved from ChatController.ReportUser)
    public async Task<ChatActionResult> ReportUserAsync(ClaimsPrincipal user, ReportRequest request)
    {
      if (request == null)
      {
        return new ChatActionResult(400, "Request body is required.");
      }

      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (!_rateLimiter.TryAcquire($"report:{currentUserGuid}", 5, TimeSpan.FromHours(1), out var retryAfter))
      {
        return new ChatActionResult(429, new { message = "Too many reports. Please try again later." }, RetryAfterHeader: Math.Ceiling(retryAfter.TotalSeconds).ToString());
      }

      if (!Guid.TryParse(request.OtherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid otherUserId.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot report yourself.");
      }

      if (string.IsNullOrWhiteSpace(request.Category))
      {
        return new ChatActionResult(400, "Category is required.");
      }

      var otherExists = await _context.Users.AnyAsync(u => u.Id == otherUserGuid);
      if (!otherExists)
      {
        return new ChatActionResult(404, "The specified user does not exist.");
      }

      Conversation? conversation = null;
      if (request.ConversationId.HasValue)
      {
        conversation = await _context.Conversations
            .FirstOrDefaultAsync(c => c.Id == request.ConversationId.Value);

        if (conversation == null)
        {
          return new ChatActionResult(400, "Conversation not found.");
        }

        var isParticipant = (conversation.ParticipantAId == currentUserGuid && conversation.ParticipantBId == otherUserGuid) ||
                            (conversation.ParticipantBId == currentUserGuid && conversation.ParticipantAId == otherUserGuid);
        if (!isParticipant)
        {
          return new ChatActionResult(403, null, Forbid: true);
        }
      }

      if (request.MessageId.HasValue)
      {
        var message = await _context.ChatMessages
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == request.MessageId.Value);

        if (message == null)
        {
          return new ChatActionResult(400, "Message not found.");
        }

        if (conversation != null && message.ConversationId != conversation.Id)
        {
          return new ChatActionResult(400, "Message does not belong to the provided conversation.");
        }

        if (conversation == null)
        {
          conversation = await _context.Conversations.FirstOrDefaultAsync(c => c.Id == message.ConversationId);
          if (conversation == null)
          {
            return new ChatActionResult(400, "Conversation not found for message.");
          }

          var isParticipant = (conversation.ParticipantAId == currentUserGuid && conversation.ParticipantBId == otherUserGuid) ||
                              (conversation.ParticipantBId == currentUserGuid && conversation.ParticipantAId == otherUserGuid);
          if (!isParticipant)
          {
            return new ChatActionResult(403, null, Forbid: true);
          }
        }
      }

      var now = DateTime.UtcNow;
      var report = new Report
      {
        ReporterUserId = currentUserGuid,
        ReportedUserId = otherUserGuid,
        ConversationId = conversation?.Id ?? request.ConversationId,
        MessageId = request.MessageId,
        Category = request.Category.Trim(),
        Notes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes!.Trim(),
        CreatedAt = now,
        Status = "New"
      };

      _context.Reports.Add(report);
      await _context.SaveChangesAsync();

      _logger.LogInformation(
        "User {Reporter} reported {Reported}. Category: {Category}, ConversationId: {ConversationId}, MessageId: {MessageId}",
        currentUserGuid,
        otherUserGuid,
        report.Category,
        report.ConversationId,
        report.MessageId
      );

      return new ChatActionResult(200, new
      {
        reportId = report.Id,
        createdAt = report.CreatedAt,
        status = report.Status
      });
    }

    // POST api/Chat/conversations/{otherUserId} (body moved from ChatController.StartConversation)
    public async Task<ChatActionResult> StartConversationAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot start a conversation with yourself.");
      }

      var otherUserExists = await _context.Users.AnyAsync(u => u.Id == otherUserGuid);
      if (!otherUserExists)
      {
        return new ChatActionResult(404, "The specified user does not exist.");
      }

      var (first, second) = NormalizeParticipants(currentUserGuid, otherUserGuid);

      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c => c.ParticipantAId == first && c.ParticipantBId == second);

      if (conversation == null)
      {
        conversation = new Conversation
        {
          ParticipantAId = first,
          ParticipantBId = second,
          CreatedAt = DateTime.UtcNow,
          UpdatedAt = DateTime.UtcNow
        };

        _context.Conversations.Add(conversation);
        await _context.SaveChangesAsync();
      }

      // Try to include basic other user info (name + avatar) to allow immediate optimistic render
      var otherUser = await _context.Users
          .AsNoTracking()
          .FirstOrDefaultAsync(u => u.Id == otherUserGuid);

      string? avatar = null;
      if (!string.IsNullOrWhiteSpace(otherUser?.ProfilePictureUrl))
      {
        try
        {
          avatar = await _storageService.ResolveUrlAsync(otherUser!.ProfilePictureUrl!, 3600);
        }
        catch { /* ignore avatar failure */ }
      }

      return new ChatActionResult(200, new
      {
        conversationId = conversation.Id,
        otherUserId = otherUserId,
        otherUserName = otherUser != null ? NameUtils.FullName(otherUser.FirstName, otherUser.LastName) : null,
        otherUserAvatar = avatar,
        status = conversation.Status
      });
    }

    // GET api/Chat/history/{otherUserId} (body moved from ChatController.GetConversationHistory)
    public async Task<ChatActionResult> GetConversationHistoryAsync(ClaimsPrincipal user, string otherUserId, int? beforeId, int limit, CancellationToken cancellationToken = default)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      // Enforce reasonable limit
      if (limit < 1 || limit > 100)
      {
        limit = 30;
      }

      var conversation = await _context.Conversations
          .FirstOrDefaultAsync(c =>
              (c.ParticipantAId == currentUserGuid && c.ParticipantBId == otherUserGuid) ||
              (c.ParticipantAId == otherUserGuid && c.ParticipantBId == currentUserGuid));

      var status = conversation?.Status ?? "Active";
      var blockedByMe = await _context.Blocks.AnyAsync(b =>
          b.BlockerUserId == currentUserGuid &&
          b.BlockedUserId == otherUserGuid &&
          (b.ExpiresAt == null || b.ExpiresAt > DateTime.UtcNow));

      var blockedByOther = await _context.Blocks.AnyAsync(b =>
          b.BlockerUserId == otherUserGuid &&
          b.BlockedUserId == currentUserGuid &&
          (b.ExpiresAt == null || b.ExpiresAt > DateTime.UtcNow));

      // Attempt to gather patient context when the other user is a Patient
      var patientContext = await PatientContextEnricher.BuildPatientContextAsync(_context, otherUserGuid);

      // Determine the cleared timestamp for the current user
      DateTime? clearedAt = null;
      if (conversation != null)
      {
        clearedAt = currentUserGuid == conversation.ParticipantAId
            ? conversation.ClearedAtByParticipantA
            : conversation.ClearedAtByParticipantB;
      }

      // Build the base query for messages between these two users
      var baseQuery = _context.ChatMessages
          .Where(m => (m.SenderId == currentUserGuid && m.ReceiverId == otherUserGuid) ||
                       (m.SenderId == otherUserGuid && m.ReceiverId == currentUserGuid));

      // Filter out messages that were sent before the user cleared their history
      if (clearedAt.HasValue)
      {
        baseQuery = baseQuery.Where(m => m.Timestamp > clearedAt.Value);
      }

      // Apply cursor-based filtering if beforeId is provided
      if (beforeId.HasValue)
      {
        // Find the timestamp of the cursor message
        var cursorMessage = await _context.ChatMessages
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == beforeId.Value);

        if (cursorMessage != null)
        {
          // Only fetch messages with timestamp earlier than the cursor
          baseQuery = baseQuery.Where(m => m.Timestamp < cursorMessage.Timestamp);
        }
      }

      // Sort by timestamp descending (newest first) and take limit + 1
      // We fetch one extra to determine if there are more pages
      var messageEntities = await baseQuery
          .OrderByDescending(m => m.Timestamp)
          .Take(limit + 1)
          .ToListAsync();

      // Determine if there are more messages
      var hasMore = messageEntities.Count > limit;
      if (hasMore)
      {
        // Remove the extra message we fetched for pagination check
        messageEntities = messageEntities.Take(limit).ToList();
      }

      // Reverse the list to get chronological order (oldest to newest in this batch)
      messageEntities.Reverse();

      // Map to view models
      var messages = new List<ChatMessageViewModel>(messageEntities.Count);
      foreach (var message in messageEntities)
      {
        var mapped = await _messageMapper.ToViewModelAsync(
            message,
            currentUserGuid,
            patientContext,
            cancellationToken);
        messages.Add(mapped);
      }

      // Determine the next cursor (oldest message id in this batch)
      int? nextCursor = null;
      if (hasMore && messageEntities.Count > 0)
      {
        // The oldest message in the batch is the first one (after reversing)
        nextCursor = messageEntities[0].Id;
      }

      return new ChatActionResult(200, new
      {
        status,
        isBlockedByMe = blockedByMe,
        isBlockedByOther = blockedByOther,
        closedAt = conversation?.ClosedAt,
        closedByUserId = conversation?.ClosedByUserId,
        messages,
        patientContext,
        nextCursor,
        hasMore
      });
    }

    // GET api/Chat/conversations (body moved from ChatController.GetConversationSummaries)
    public async Task<ChatActionResult> GetConversationSummariesAsync(ClaimsPrincipal user)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      var conversations = await _context.Conversations
          .Where(c => c.ParticipantAId == currentUserGuid || c.ParticipantBId == currentUserGuid)
          .ToListAsync();

      if (!conversations.Any())
      {
        return new ChatActionResult(200, new List<object>());
      }

      var conversationIds = conversations.Select(c => c.Id).ToList();

      // Build a dictionary of cleared timestamps for the current user per conversation
      var clearedTimestamps = conversations.ToDictionary(
          c => c.Id,
          c => currentUserGuid == c.ParticipantAId ? c.ClearedAtByParticipantA : c.ClearedAtByParticipantB
      );

      // Get latest messages for each conversation, respecting cleared timestamps
      var allMessages = await _context.ChatMessages
          .Where(m => conversationIds.Contains(m.ConversationId))
          .ToListAsync();

      var latestMessages = new Dictionary<int, ChatMessage>();
      foreach (var conversationId in conversationIds)
      {
        var clearedAt = clearedTimestamps[conversationId];
        var messagesForConversation = allMessages
            .Where(m => m.ConversationId == conversationId)
            .Where(m => !clearedAt.HasValue || m.Timestamp > clearedAt.Value)
            .OrderByDescending(m => m.Timestamp)
            .FirstOrDefault();
        if (messagesForConversation != null)
        {
          latestMessages[conversationId] = messagesForConversation;
        }
      }

      // Get unread counts, respecting cleared timestamps
      var unreadCounts = new Dictionary<int, int>();
      foreach (var conversationId in conversationIds)
      {
        var clearedAt = clearedTimestamps[conversationId];
        var count = allMessages
            .Where(m => m.ConversationId == conversationId)
            .Where(m => m.ReceiverId == currentUserGuid && !m.IsRead)
            .Where(m => !clearedAt.HasValue || m.Timestamp > clearedAt.Value)
            .Count();
        if (count > 0)
        {
          unreadCounts[conversationId] = count;
        }
      }

      var summaries = conversations.Select(c =>
      {
        latestMessages.TryGetValue(c.Id, out var latestMessage);
        unreadCounts.TryGetValue(c.Id, out var unreadCount);

        return new
        {
          conversationId = c.Id,
          otherUserId = c.ParticipantAId == currentUserGuid ? c.ParticipantBId : c.ParticipantAId,
          latestMessageTimestamp = latestMessage?.Timestamp ?? c.UpdatedAt,
          latestMessage = latestMessage == null ? null : (latestMessage.MessageType == "IMAGE" ? "(Image)" : latestMessage.Content),
          unreadCount,
          Status = c.Status,
          ClosedAt = c.ClosedAt,
          ClosedByUserId = c.ClosedByUserId,
          latestMessageIsMine = latestMessage?.SenderId == currentUserGuid
        };
      })
      .OrderByDescending(c => c.latestMessageTimestamp)
      .ToList();

      var otherIds = summaries.Select(c => c.otherUserId).ToList();
      var now = DateTime.UtcNow;

      var blocksByMe = await _context.Blocks
          .Where(b => b.BlockerUserId == currentUserGuid && otherIds.Contains(b.BlockedUserId) && (b.ExpiresAt == null || b.ExpiresAt > now))
          .ToListAsync();

      var blocksByOthers = await _context.Blocks
          .Where(b => b.BlockerUserId != currentUserGuid && otherIds.Contains(b.BlockerUserId) && b.BlockedUserId == currentUserGuid && (b.ExpiresAt == null || b.ExpiresAt > now))
          .ToListAsync();
      var users = await _context.Users
          .Where(u => otherIds.Contains(u.Id))
          .Select(u => new { u.Id, u.FirstName, u.LastName, u.ProfilePictureUrl })
          .ToListAsync();

      var roles = await _context.UserRoles
          .Where(ur => otherIds.Contains(ur.UserId))
          .Join(_context.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
          .ToListAsync();

      string PickRole(IEnumerable<string> names)
      {
        var order = new[] { "PhysicalTherapist", "Patient" };
        var set = names.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var r in order)
        {
          if (set.Contains(r)) return r;
        }
        var firstNonUser = names.FirstOrDefault(n => !string.Equals(n, "User", StringComparison.OrdinalIgnoreCase));
        return firstNonUser ?? "User";
      }

      var result = new List<object>();
      foreach (var summary in summaries)
      {
        var summaryUser = users.FirstOrDefault(u => u.Id == summary.otherUserId);
        var roleNames = roles.Where(r => r.UserId == summary.otherUserId)
            .Select(r => r.Name)
            .Where(n => !string.IsNullOrEmpty(n))
            .Select(n => n!);

        string? avatar = null;
        if (!string.IsNullOrWhiteSpace(summaryUser?.ProfilePictureUrl))
        {
          try
          {
            avatar = await _storageService.ResolveUrlAsync(summaryUser!.ProfilePictureUrl!, 3600);
          }
          catch { /* ignore avatar errors */ }
        }

        result.Add(new
        {
          summary.conversationId,
          otherUserId = summary.otherUserId,
          otherUserName = summaryUser != null ? NameUtils.FullName(summaryUser.FirstName, summaryUser.LastName) : null,
          otherUserRole = PickRole(roleNames),
          otherUserAvatar = avatar,
          latestMessage = summary.latestMessage,
          latestMessageTimestamp = summary.latestMessageTimestamp,
          unreadCount = summary.unreadCount,
          status = summary.Status,
          closedAt = summary.ClosedAt,
          closedByUserId = summary.ClosedByUserId,
          latestMessageIsMine = summary.latestMessageIsMine,
          isBlockedByMe = blocksByMe.Any(b => b.BlockedUserId == summary.otherUserId),
          isBlockedByOther = blocksByOthers.Any(b => b.BlockerUserId == summary.otherUserId)
        });
      }

      return new ChatActionResult(200, result);
    }

    // POST api/Chat/history/{otherUserId}/read (body moved from ChatController.MarkConversationAsRead)
    public async Task<ChatActionResult> MarkConversationAsReadAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      var unreadMessages = await _context.ChatMessages
          .Where(m => m.SenderId == otherUserGuid && m.ReceiverId == currentUserGuid && !m.IsRead)
          .ToListAsync();

      if (unreadMessages.Count == 0)
      {
        return new ChatActionResult(200, new { UpdatedMessages = 0 });
      }

      foreach (var message in unreadMessages)
      {
        message.IsRead = true;
      }

      await _context.SaveChangesAsync();

      return new ChatActionResult(200, new { UpdatedMessages = unreadMessages.Count });
    }

    private static (Guid First, Guid Second) NormalizeParticipants(Guid userA, Guid userB)
    {
      return userA.CompareTo(userB) <= 0 ? (userA, userB) : (userB, userA);
    }
  }
}
