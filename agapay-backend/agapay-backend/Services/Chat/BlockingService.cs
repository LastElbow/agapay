using System;
using System.Security.Claims;
using System.Threading.Tasks;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Notifications;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Chat
{
  /// <summary>
  /// User blocking logic extracted verbatim from ChatController. Responses are
  /// returned as ChatActionResult records; the controller maps them back to the
  /// original IActionResult types.
  /// </summary>
  public class BlockingService : IBlockingService
  {
    private readonly agapayDbContext _context;
    private readonly IRealtimeNotifier _realtimeNotifier;
    private readonly ILogger<BlockingService> _logger;

    public BlockingService(
      agapayDbContext context,
      IRealtimeNotifier realtimeNotifier,
      ILogger<BlockingService> logger
    )
    {
      _context = context;
      _realtimeNotifier = realtimeNotifier;
      _logger = logger;
    }

    // POST api/Chat/block/{otherUserId} (body moved from ChatController.BlockUser)
    public async Task<ChatActionResult> BlockUserAsync(ClaimsPrincipal user, string otherUserId, BlockRequest? request)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot block yourself.");
      }

      var otherExists = await _context.Users.AnyAsync(u => u.Id == otherUserGuid);
      if (!otherExists)
      {
        return new ChatActionResult(404, "The specified user does not exist.");
      }

      var now = DateTime.UtcNow;
      var existing = await _context.Blocks.FirstOrDefaultAsync(b =>
          b.BlockerUserId == currentUserGuid && b.BlockedUserId == otherUserGuid);

      var expiresAt = request?.ExpiresAt?.ToUniversalTime();
      if (expiresAt.HasValue && expiresAt <= now)
      {
        return new ChatActionResult(400, "ExpiresAt must be in the future.");
      }

      var reason = string.IsNullOrWhiteSpace(request?.Reason) ? null : request!.Reason!.Trim();

      if (existing is null)
      {
        var block = new Block
        {
          BlockerUserId = currentUserGuid,
          BlockedUserId = otherUserGuid,
          CreatedAt = now,
          ExpiresAt = expiresAt,
          Reason = reason
        };

        _context.Blocks.Add(block);
      }
      else
      {
        existing.CreatedAt = now;
        existing.ExpiresAt = expiresAt;
        existing.Reason = reason;
      }

      await _context.SaveChangesAsync();

      _logger.LogInformation(
        "User {UserId} blocked {OtherUserId} (expiresAt: {ExpiresAt})",
        currentUserGuid,
        otherUserGuid,
        expiresAt
      );

      var payloadToSelf = new
      {
        blockedUserId = otherUserGuid,
        blockedAt = now,
        expiresAt,
        reason,
        isBlocked = true
      };

      var payloadToOther = new
      {
        blockedByUserId = currentUserGuid,
        blockedAt = now,
        expiresAt
      };

      await _realtimeNotifier.SendToUserAsync(RealtimeHub.Chat, currentUserGuid.ToString(), SignalREvents.BlockStatusChanged, payloadToSelf);
      await _realtimeNotifier.SendToUserAsync(RealtimeHub.Chat, otherUserGuid.ToString(), SignalREvents.BlockedByOther, payloadToOther);

      return new ChatActionResult(200, payloadToSelf);
    }

    // DELETE api/Chat/block/{otherUserId} (body moved from ChatController.UnblockUser)
    public async Task<ChatActionResult> UnblockUserAsync(ClaimsPrincipal user, string otherUserId)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid) || !Guid.TryParse(otherUserId, out var otherUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      if (currentUserGuid == otherUserGuid)
      {
        return new ChatActionResult(400, "Cannot unblock yourself.");
      }

      var existing = await _context.Blocks.FirstOrDefaultAsync(b =>
          b.BlockerUserId == currentUserGuid && b.BlockedUserId == otherUserGuid);

      if (existing is null)
      {
        return new ChatActionResult(204, null);
      }

      _context.Blocks.Remove(existing);
      await _context.SaveChangesAsync();

      _logger.LogInformation(
        "User {UserId} unblocked {OtherUserId}",
        currentUserGuid,
        otherUserGuid
      );

      var payloadToSelf = new
      {
        blockedUserId = otherUserGuid,
        isBlocked = false
      };

      var payloadToOther = new
      {
        unblockedByUserId = currentUserGuid
      };

      await _realtimeNotifier.SendToUserAsync(RealtimeHub.Chat, currentUserGuid.ToString(), SignalREvents.BlockStatusChanged, payloadToSelf);
      await _realtimeNotifier.SendToUserAsync(RealtimeHub.Chat, otherUserGuid.ToString(), SignalREvents.UnblockedByOther, payloadToOther);

      return new ChatActionResult(200, payloadToSelf);
    }

    // GET api/Chat/blocks (body moved from ChatController.GetBlockedUsers)
    public async Task<ChatActionResult> GetBlockedUsersAsync(ClaimsPrincipal user)
    {
      var currentUserId = user.FindFirstValue(ClaimTypes.NameIdentifier);
      if (!Guid.TryParse(currentUserId, out var currentUserGuid))
      {
        return new ChatActionResult(400, "Invalid user ID format.");
      }

      var now = DateTime.UtcNow;
      var blocks = await _context.Blocks
          .Where(b => b.BlockerUserId == currentUserGuid && (b.ExpiresAt == null || b.ExpiresAt > now))
          .Select(b => new
          {
            blockedUserId = b.BlockedUserId,
            b.CreatedAt,
            b.ExpiresAt,
            b.Reason
          })
          .ToListAsync();

      return new ChatActionResult(200, blocks);
    }
  }
}
