using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;

namespace agapay_backend.Services.Chat
{
  /// <summary>
  /// Outcome of a chat service operation that used to return an IActionResult:
  /// the controller maps these back to the exact same result types/status codes.
  /// Forbid restores Forbid(); RetryAfterHeader restores the 429 Retry-After header.
  /// </summary>
  public record ChatActionResult(int StatusCode, object? Payload, bool Forbid = false, string? RetryAfterHeader = null);

  /// <summary>
  /// Conversation logic extracted from ChatController. Every method returns a
  /// ChatActionResult so the controller can map it back to the original
  /// IActionResult types with byte-identical status codes and payloads.
  /// </summary>
  public interface IConversationService
  {
    // POST api/Chat/conversations/{otherUserId}
    Task<ChatActionResult> StartConversationAsync(ClaimsPrincipal user, string otherUserId);

    // DELETE api/Chat/conversations/{otherUserId} (clears history for the caller)
    Task<ChatActionResult> DeleteConversationAsync(ClaimsPrincipal user, string otherUserId);

    // POST api/Chat/conversations/{otherUserId}/end
    Task<ChatActionResult> EndConversationAsync(ClaimsPrincipal user, string otherUserId);

    // POST api/Chat/conversations/{otherUserId}/reopen
    Task<ChatActionResult> ReopenConversationAsync(ClaimsPrincipal user, string otherUserId);

    // GET api/Chat/history/{otherUserId}
    Task<ChatActionResult> GetConversationHistoryAsync(ClaimsPrincipal user, string otherUserId, int? beforeId, int limit, CancellationToken cancellationToken = default);

    // GET api/Chat/conversations
    Task<ChatActionResult> GetConversationSummariesAsync(ClaimsPrincipal user);

    // POST api/Chat/history/{otherUserId}/read
    Task<ChatActionResult> MarkConversationAsReadAsync(ClaimsPrincipal user, string otherUserId);

    // POST api/Chat/report
    Task<ChatActionResult> ReportUserAsync(ClaimsPrincipal user, ReportRequest request);
  }
}
