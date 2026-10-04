using agapay_backend.Models;
using agapay_backend.Services;
using agapay_backend.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class RatingsController : ControllerBase
  {
    private readonly IRatingService _ratingService;
    private readonly IHubContext<RatingsHub> _ratingsHub;
    private readonly ILogger<RatingsController> _logger;

    public RatingsController(IRatingService ratingService, IHubContext<RatingsHub> ratingsHub, ILogger<RatingsController> logger)
    {
      _ratingService = ratingService;
      _ratingsHub = ratingsHub;
      _logger = logger;
    }

    [HttpPost]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> SubmitRating(SubmitRatingDto dto)
    {
      _logger.LogInformation("🔵 SubmitRating endpoint called");
      _logger.LogInformation("📥 Received DTO: TherapistId={TherapistId}, ContractId={ContractId}, Score={Score}, Comment={Comment}", dto.TherapistId, dto.ContractId, dto.Score, dto.Comment);

      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      _logger.LogInformation("🔑 User ID from claims: {UserId}", userId);

      if (userId is null)
      {
        _logger.LogWarning("❌ User not authenticated");
        return Unauthorized();
      }

      try
      {
        _logger.LogInformation("📤 Calling SubmitRatingAsync...");
        await _ratingService.SubmitRatingAsync(dto, Guid.Parse(userId));
        _logger.LogInformation("✅ SubmitRatingAsync completed successfully");

        // Broadcast real-time event to notify therapist of new rating
        await _ratingsHub.Clients.All.SendAsync("RatingSubmitted", new { therapistId = dto.TherapistId });
        _logger.LogInformation("📡 Broadcasted RatingSubmitted event for therapist {TherapistId}", dto.TherapistId);

        return Ok(new { message = "Rating submitted successfully" });
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "❌ Error in SubmitRating: {Message}", ex.Message);
        return StatusCode(500, new { message = ex.Message });
      }
    }

    [HttpPost("patient")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> SubmitPatientRating(SubmitPatientRatingDto dto)
    {
      _logger.LogInformation("🔵 SubmitPatientRating endpoint called");
      _logger.LogInformation("📥 Received DTO: PatientId={PatientId}, ContractId={ContractId}, Score={Score}, Comment={Comment}", dto.PatientId, dto.ContractId, dto.Score, dto.Comment);

      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      _logger.LogInformation("🔑 User ID from claims: {UserId}", userId);

      if (userId is null)
      {
        _logger.LogWarning("❌ User not authenticated");
        return Unauthorized();
      }

      try
      {
        _logger.LogInformation("📤 Calling SubmitPatientRatingAsync...");
        await _ratingService.SubmitPatientRatingAsync(dto, Guid.Parse(userId));
        _logger.LogInformation("✅ SubmitPatientRatingAsync completed successfully");
        return Ok(new { message = "Patient rating submitted successfully" });
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "❌ Error in SubmitPatientRating: {Message}", ex.Message);
        return StatusCode(500, new { message = ex.Message });
      }
    }

    [HttpGet("therapist/{therapistId}/score")]
    [Authorize]
    public async Task<IActionResult> GetTherapistScore(int therapistId)
    {
      var result = await _ratingService.ComputeNormalizedRatingAsync(therapistId);
      return Ok(new
      {
        normalizedScore = result.normalizedScore,
        rawBayes = result.rawBayes,
        ratingCount = result.n,
        average = result.avg,
        globalAverage = result.globalAvg,
        smoothingK = result.k
      });
    }

    [HttpGet("diagnostic/check-ids")]
    [Authorize]
    public async Task<IActionResult> DiagnosticCheckIds([FromQuery] int therapistId, [FromQuery] int? sessionId, [FromQuery] int? patientId)
    {
      _logger.LogInformation("🔍 Diagnostic endpoint called");
      _logger.LogInformation("📥 Checking TherapistId={TherapistId}, SessionId={SessionId}, PatientId={PatientId}", therapistId, sessionId, patientId);

      var diagnosticResult = await _ratingService.DiagnosticCheckIdsAsync(therapistId, sessionId, patientId);

      return Ok(diagnosticResult);
    }

    [HttpGet("therapist/me")]
    [Authorize(Roles = "PhysicalTherapist")]  // TODO: REMOVE THIS - Temporarily allow unauthenticated access for debugging
    public async Task<IActionResult> GetMyRatings()
    {
      _logger.LogInformation("🔵 GetMyRatings endpoint called");
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      _logger.LogInformation("🔑 User ID from claims: {UserId}", userId);

      if (userId is null)
      {
        _logger.LogWarning("❌ User not authenticated");
        return Unauthorized();
      }

      var therapist = await _ratingService.GetTherapistByUserId(Guid.Parse(userId));
      if (therapist is null)
      {
        _logger.LogWarning("❌ Therapist profile not found for userId: {UserId}", userId);
        return NotFound(new { message = "Therapist profile not found" });
      }

      _logger.LogInformation("✅ Therapist found: Id={TherapistId}", therapist.Id);
      var ratings = await _ratingService.GetTherapistRatingsAsync(therapist.Id);
      _logger.LogInformation("✅ Retrieved {Count} ratings for therapist {TherapistId}", ratings.Count, therapist.Id);
      return Ok(ratings);
    }

    [HttpGet("therapist/{therapistId}")]
    [Authorize]
    public async Task<IActionResult> GetTherapistRatings(int therapistId)
    {
      _logger.LogInformation("🔵 GetTherapistRatings endpoint called");
      _logger.LogInformation("📥 Requested therapistId: {TherapistId}", therapistId);

      try
      {
        var ratings = await _ratingService.GetTherapistRatingsAsync(therapistId);
        _logger.LogInformation("✅ Retrieved {Count} ratings for therapist {TherapistId}", ratings.Count, therapistId);
        return Ok(ratings);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "❌ Error in GetTherapistRatings: {Message}", ex.Message);
        return StatusCode(500, new { message = ex.Message });
      }
    }
  }
}
