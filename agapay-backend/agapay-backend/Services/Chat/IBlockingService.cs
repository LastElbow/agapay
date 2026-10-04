using System;
using System.Security.Claims;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;

namespace agapay_backend.Services.Chat
{
  /// <summary>
  /// User blocking logic extracted from ChatController. Every method returns a
  /// ChatActionResult so the controller can map it back to the original
  /// IActionResult types with byte-identical status codes and payloads.
  /// </summary>
  public interface IBlockingService
  {
    // POST api/Chat/block/{otherUserId}
    Task<ChatActionResult> BlockUserAsync(ClaimsPrincipal user, string otherUserId, BlockRequest? request);

    // DELETE api/Chat/block/{otherUserId}
    Task<ChatActionResult> UnblockUserAsync(ClaimsPrincipal user, string otherUserId);

    // GET api/Chat/blocks
    Task<ChatActionResult> GetBlockedUsersAsync(ClaimsPrincipal user);
  }
}
