using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Chat;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace agapay_backend.Controllers
{
  [Authorize]
  [ApiController]
  [Route("api/[controller]")]
  public class ChatController : ControllerBase
  {
    private readonly IConversationService _conversationService;
    private readonly IBlockingService _blockingService;

    public ChatController(
      IConversationService conversationService,
      IBlockingService blockingService
    )
    {
      _conversationService = conversationService;
      _blockingService = blockingService;
    }

    // Maps a ChatActionResult back to the same IActionResult type the extracted
    // ChatController body returned (see Services/Auth/IAuthService.cs pattern).
    // Forbid restores Forbid(); RetryAfterHeader restores the 429 Retry-After header.
    private IActionResult ToActionResult(ChatActionResult result)
    {
      if (result.Forbid)
      {
        return Forbid();
      }

      if (result.RetryAfterHeader is not null)
      {
        Response.Headers["Retry-After"] = result.RetryAfterHeader;
      }

      return result.StatusCode switch
      {
        200 => result.Payload is null ? Ok() : Ok(result.Payload),
        204 => NoContent(),
        400 => result.Payload is null ? BadRequest() : BadRequest(result.Payload),
        404 => result.Payload is null ? NotFound() : NotFound(result.Payload),
        _ => StatusCode(result.StatusCode, result.Payload)
      };
    }

    /// <summary>
    /// Clears all messages in a conversation but keeps the conversation record.
    /// Users can continue messaging each other after clearing (like Facebook Messenger).
    /// </summary>
    [HttpDelete("conversations/{otherUserId}")]
    public async Task<IActionResult> DeleteConversation(string otherUserId)
      => ToActionResult(await _conversationService.DeleteConversationAsync(User, otherUserId));

    [HttpPost("conversations/{otherUserId}/end")]
    public async Task<IActionResult> EndConversation(string otherUserId)
      => ToActionResult(await _conversationService.EndConversationAsync(User, otherUserId));

    [HttpPost("conversations/{otherUserId}/reopen")]
    public async Task<IActionResult> ReopenConversation(string otherUserId)
      => ToActionResult(await _conversationService.ReopenConversationAsync(User, otherUserId));

    [HttpPost("block/{otherUserId}")]
    public async Task<IActionResult> BlockUser(string otherUserId, [FromBody] BlockRequest? request)
      => ToActionResult(await _blockingService.BlockUserAsync(User, otherUserId, request));

    [HttpPost("report")]
    public async Task<IActionResult> ReportUser([FromBody] ReportRequest request)
      => ToActionResult(await _conversationService.ReportUserAsync(User, request));

    [HttpDelete("block/{otherUserId}")]
    public async Task<IActionResult> UnblockUser(string otherUserId)
      => ToActionResult(await _blockingService.UnblockUserAsync(User, otherUserId));

    [HttpPost("conversations/{otherUserId}")]
    public async Task<IActionResult> StartConversation(string otherUserId)
      => ToActionResult(await _conversationService.StartConversationAsync(User, otherUserId));

    [HttpGet("blocks")]
    public async Task<IActionResult> GetBlockedUsers()
      => ToActionResult(await _blockingService.GetBlockedUsersAsync(User));

    [HttpGet("history/{otherUserId}")]
    public async Task<IActionResult> GetConversationHistory(
      string otherUserId,
      [FromQuery] int? beforeId = null,
      [FromQuery] int limit = 30)
      => ToActionResult(await _conversationService.GetConversationHistoryAsync(User, otherUserId, beforeId, limit, HttpContext?.RequestAborted ?? default));

    [HttpGet("conversations")]
    public async Task<IActionResult> GetConversationSummaries()
      => ToActionResult(await _conversationService.GetConversationSummariesAsync(User));

    [HttpPost("history/{otherUserId}/read")]
    public async Task<IActionResult> MarkConversationAsRead(string otherUserId)
      => ToActionResult(await _conversationService.MarkConversationAsReadAsync(User, otherUserId));
  }
}
