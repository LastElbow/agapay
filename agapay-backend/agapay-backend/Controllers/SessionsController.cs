using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize]
  public class SessionsController : ControllerBase
  {
    private readonly agapayDbContext _db;
    private readonly ISessionService _sessions;
    private readonly ILogger<SessionsController> _logger;

    public SessionsController(agapayDbContext db, ISessionService sessions, ILogger<SessionsController> logger)
    {
      _db = db;
      _sessions = sessions;
      _logger = logger;
    }

    // Maps a SessionActionResult back to the same IActionResult type the
    // extracted endpoint body used to return, so status codes and result
    // types stay byte-identical.
    private IActionResult ToActionResult(SessionActionResult result)
    {
      return result.StatusCode switch
      {
        200 => result.Payload is null ? Ok() : Ok(result.Payload),
        201 => result.Payload is null ? StatusCode(201) : StatusCode(201, result.Payload),
        400 => result.Payload is null ? BadRequest() : BadRequest(result.Payload),
        401 => Unauthorized(),
        403 => Forbid(),
        404 => result.Payload is null ? NotFound() : NotFound(result.Payload),
        _ => StatusCode(result.StatusCode, result.Payload)
      };
    }

    // Returns upcoming sessions for the authenticated user (therapist or patient)
    // GET: /api/sessions/me/upcoming?take=5
    [HttpGet("me/upcoming")]
    [Authorize]
    public async Task<IActionResult> GetMyUpcomingSessions([FromQuery] int take = 5)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var isTherapist = User.IsInRole("PhysicalTherapist");
      var isPatient = User.IsInRole("Patient");

      IQueryable<TherapySession> baseQuery = _db.TherapySessions
          .AsNoTracking()
          .Include(s => s.Contract)
          .ThenInclude(c => c!.PhysicalTherapist)
          .Include(s => s.Patient).ThenInclude(p => p!.User)
          .Include(s => s.PhysicalTherapist).ThenInclude(t => t!.User);

      if (isTherapist)
      {
        // Resolve therapist PK once to filter by scalar FK and avoid cartesian-product duplicates
        var therapistId = await _db.PhysicalTherapists
            .Where(t => t.UserId == guid)
            .Select(t => t.Id)
            .FirstOrDefaultAsync();
        if (therapistId == 0) return Ok(Array.Empty<object>());

        // Include sessions where:
        // 1. User is the current session therapist, OR
        // 2. User is the original contract therapist (for monitoring reliever sessions)
        baseQuery = baseQuery.Where(s =>
          s.PhysicalTherapistId == therapistId ||
          s.Contract!.PhysicalTherapistId == therapistId);
      }
      else if (isPatient)
      {
        baseQuery = baseQuery.Where(s => s.Patient!.UserId == guid);
      }
      else if (!User.IsInRole("Admin"))
      {
        // Unknown role; return empty
        return Ok(Array.Empty<object>());
      }

      // Clamp take to a reasonable max to prevent unbounded queries
      if (take <= 0) take = 5;
      if (take > 50) take = 50;

      var sessions = await baseQuery
          .Where(s =>
              s.Status == SessionStatus.Scheduled
                  || s.Status == SessionStatus.PendingConfirmation
                  || s.Status == SessionStatus.InProgress
                  || s.Status == SessionStatus.PendingRescheduleApproval)
          .OrderBy(s => s.StartAt)
          .Take(take)
          .Select(s => new
          {
            id = s.Id,
            contractId = s.ContractId,
            patientId = s.PatientId,
            patientFirstName = s.Patient != null ? s.Patient.FirstName : null,
            patientLastName = s.Patient != null ? s.Patient.LastName : null,
            physicalTherapistId = s.PhysicalTherapistId,
            therapistFirstName = s.PhysicalTherapist != null ? s.PhysicalTherapist.User.FirstName : null,
            therapistLastName = s.PhysicalTherapist != null ? s.PhysicalTherapist.User.LastName : null,
            therapistProfilePictureUrl = s.PhysicalTherapist != null ? s.PhysicalTherapist.ProfilePictureUrl : null,
            startAt = s.StartAt,
            endAt = s.EndAt,
            durationMinutes = s.DurationMinutes,
            status = s.Status.ToString(),
            contractStatus = s.Contract != null ? s.Contract.Status.ToString() : null,
            conditionCase = s.ConditionCase,
            locationAddress = s.LocationAddress,
            latitude = s.Latitude,
            longitude = s.Longitude,
            totalFee = s.TotalFee,
            patientFee = s.PatientFee,
            professionalFee = s.ProfessionalFee,
            locationFee = s.LocationFee,
            miscellaneousFee = s.MiscellaneousFee,
            isRescheduled = s.IsRescheduled,
            rescheduledAt = s.RescheduledAt,
            proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
            proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
            rescheduleProposalReason = s.RescheduleProposalReason,
            rescheduleProposedAt = s.RescheduleProposedAt,
            relieverTherapistId = s.RelieverTherapistId,
            relieverSubstitutionReason = s.RelieverSubstitutionReason,
            isRelieverProposed = s.IsRelieverProposed
          })
          .ToListAsync();

      // Format names in-memory after query execution
      var result = sessions.Select(s => new
      {
        s.id,
        s.contractId,
        s.patientId,
        patientName = NameUtils.FullName(s.patientFirstName, s.patientLastName),
        s.physicalTherapistId,
        therapistName = NameUtils.FullName(s.therapistFirstName, s.therapistLastName),
        s.therapistProfilePictureUrl,
        s.startAt,
        s.endAt,
        s.durationMinutes,
        s.status,
        s.contractStatus,
        s.conditionCase,
        s.locationAddress,
        s.latitude,
        s.longitude,
        s.totalFee,
        s.patientFee,
        s.professionalFee,
        s.locationFee,
        s.miscellaneousFee,
        s.isRescheduled,
        s.rescheduledAt,
        s.proposedRescheduleStartAt,
        s.proposedRescheduleEndAt,
        s.rescheduleProposalReason,
        s.rescheduleProposedAt,
        s.relieverTherapistId,
        s.relieverSubstitutionReason,
        s.isRelieverProposed
      }).ToList();

      return Ok(result);
    }

    // Returns all sessions for the authenticated user
    // GET: /api/sessions/me
    [HttpGet("me")]
    [Authorize]
    public async Task<IActionResult> GetMySessions()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var isTherapist = User.IsInRole("PhysicalTherapist");
      var isPatient = User.IsInRole("Patient");

      IQueryable<TherapySession> baseQuery = _db.TherapySessions
          .AsNoTracking()
          .Include(s => s.Contract)
          .ThenInclude(c => c!.PhysicalTherapist)
          .Include(s => s.Patient).ThenInclude(p => p!.User)
          .Include(s => s.PhysicalTherapist).ThenInclude(t => t!.User);

      if (isTherapist)
      {
        // Resolve therapist PK once to filter by scalar FK and avoid cartesian-product duplicates
        var therapistId = await _db.PhysicalTherapists
            .Where(t => t.UserId == guid)
            .Select(t => t.Id)
            .FirstOrDefaultAsync();
        if (therapistId == 0) return Ok(Array.Empty<object>());

        // Include sessions where:
        // 1. User is the current session therapist, OR
        // 2. User is the original contract therapist (for monitoring reliever sessions)
        baseQuery = baseQuery.Where(s =>
          s.PhysicalTherapistId == therapistId ||
          s.Contract!.PhysicalTherapistId == therapistId);
      }
      else if (isPatient)
      {
        baseQuery = baseQuery.Where(s => s.Patient!.UserId == guid);
      }
      else if (!User.IsInRole("Admin"))
      {
        return Ok(Array.Empty<object>());
      }

      var sessions = await baseQuery
          .OrderByDescending(s => s.StartAt)
          .Select(s => new
          {
            id = s.Id,
            contractId = s.ContractId,
            patientId = s.PatientId,
            patientName = s.Patient != null ? ($"{s.Patient.FirstName} {s.Patient.LastName}").Trim() : null,
            physicalTherapistId = s.PhysicalTherapistId,
            therapistName = s.PhysicalTherapist != null ? ($"{s.PhysicalTherapist.User.FirstName} {s.PhysicalTherapist.User.LastName}").Trim() : null,
            therapistProfilePictureUrl = s.PhysicalTherapist != null ? s.PhysicalTherapist.ProfilePictureUrl : null,
            startAt = s.StartAt,
            endAt = s.EndAt,
            durationMinutes = s.DurationMinutes,
            status = s.Status.ToString(),
            contractStatus = s.Contract != null ? s.Contract.Status.ToString() : null,
            conditionCase = s.ConditionCase,
            locationAddress = s.LocationAddress,
            latitude = s.Latitude,
            longitude = s.Longitude,
            totalFee = s.TotalFee,
            patientFee = s.PatientFee,
            professionalFee = s.ProfessionalFee,
            locationFee = s.LocationFee,
            miscellaneousFee = s.MiscellaneousFee,
            isRescheduled = s.IsRescheduled,
            rescheduledAt = s.RescheduledAt,
            proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
            proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
            rescheduleProposalReason = s.RescheduleProposalReason,
            rescheduleProposedAt = s.RescheduleProposedAt,
            relieverTherapistId = s.RelieverTherapistId,
            relieverSubstitutionReason = s.RelieverSubstitutionReason,
            isRelieverProposed = s.IsRelieverProposed
          })
          .ToListAsync();

      return Ok(sessions);
    }

    // Returns session detail by id for participants (patient/therapist) or admin
    [HttpGet("{sessionId:int}")]
    [Authorize]
    public async Task<IActionResult> GetSessionDetail(int sessionId)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var s = await _db.TherapySessions
          .AsNoTracking()
          .Include(x => x.Contract)
          .ThenInclude(c => c!.PhysicalTherapist)
          .ThenInclude(t => t!.User)
          .Include(x => x.Patient).ThenInclude(p => p!.User)
          .Include(x => x.PhysicalTherapist).ThenInclude(t => t!.User)
          .FirstOrDefaultAsync(x => x.Id == sessionId);

      if (s is null) return NotFound();

      // Check if user is a participant (patient, current session therapist, or original contract therapist)
      // Note: upcoming sessions intentionally include the contract therapist for reliever monitoring;
      // session detail should follow the same access rule to avoid list->detail 403s.
      var isParticipant = (s.Patient?.UserId == guid)
        || (s.PhysicalTherapist?.UserId == guid)
        || (s.Contract?.PhysicalTherapist?.UserId == guid);

      // Also check if user is the proposed reliever therapist
      var isRelieverTherapist = false;
      if (s.RelieverTherapistId.HasValue)
      {
        var relieverTherapistCheck = await _db.PhysicalTherapists
            .FirstOrDefaultAsync(t => t.Id == s.RelieverTherapistId.Value && t.UserId == guid);
        isRelieverTherapist = relieverTherapistCheck != null;
      }

      if (!isParticipant && !isRelieverTherapist && !User.IsInRole("Admin")) return Forbid();

      // Check if ratings exist for this session's contract
      var hasBeenRatedByPatient = await _db.TherapistRatings
          .AnyAsync(r => r.ContractId == s.ContractId);
      var hasBeenRatedByTherapist = await _db.PatientRatings
          .AnyAsync(r => r.ContractId == s.ContractId);

      // Build full names for display
      var patientFirstName = s.Patient?.FirstName ?? "";
      var patientLastName = s.Patient?.LastName ?? "";
      var patientName = NameUtils.FullName(patientFirstName, patientLastName);
      if (string.IsNullOrEmpty(patientName)) patientName = null;

      var therapistFirstName = s.PhysicalTherapist?.User?.FirstName ?? "";
      var therapistLastName = s.PhysicalTherapist?.User?.LastName ?? "";
      var therapistName = NameUtils.FullName(therapistFirstName, therapistLastName);
      if (string.IsNullOrEmpty(therapistName)) therapistName = null;

      // Get reliever therapist name if proposed
      string? relieverTherapistName = null;
      string? relieverTherapistSpecialty = null;
      if (s.RelieverTherapistId.HasValue)
      {
        var relieverTherapist = await _db.PhysicalTherapists
            .Include(t => t.User)
            .Include(t => t.Specializations)
            .FirstOrDefaultAsync(t => t.Id == s.RelieverTherapistId.Value);
        if (relieverTherapist != null)
        {
          relieverTherapistName = NameUtils.FullName(relieverTherapist.User?.FirstName, relieverTherapist.User?.LastName);
          relieverTherapistSpecialty = relieverTherapist.Specializations != null && relieverTherapist.Specializations.Any()
              ? string.Join(", ", relieverTherapist.Specializations.Select(s => s.Name))
              : null;
        }
      }

      var dto = new
      {
        id = s.Id,
        patientId = s.PatientId,
        patientName = patientName,
        physicalTherapistId = s.PhysicalTherapistId,
        therapistName = therapistName,
        therapistLicenseNo = s.PhysicalTherapist?.LicenseNumber,
        // Reliever session detection: the session therapist differs from the contract owner
        isRelieverSession = s.Contract != null && s.PhysicalTherapistId != s.Contract.PhysicalTherapistId,
        originalTherapistId = s.Contract?.PhysicalTherapistId,
        contractId = s.ContractId,
        contractStatus = s.Contract?.Status.ToString(),
        contractEndDate = s.Contract?.EndDate,
        contractEndReason = s.Contract?.ContractEndReason,
        contractEndedAt = s.Contract?.ContractEndedAt,
        startAt = s.StartAt,
        endAt = s.EndAt,
        durationMinutes = s.DurationMinutes,
        locationAddress = s.LocationAddress,
        latitude = s.Latitude,
        longitude = s.Longitude,
        patientAddress = s.Patient?.Address,
        patientBarangay = s.Patient?.Barangay,
        patientLatitude = s.Patient?.Latitude,
        patientLongitude = s.Patient?.Longitude,
        // Effective location (session location or fallback to patient location)
        effectiveAddress = s.LocationAddress ?? s.Patient?.Address,
        effectiveLatitude = s.Latitude ?? s.Patient?.Latitude,
        effectiveLongitude = s.Longitude ?? s.Patient?.Longitude,
        doctorReferralImageUrl = s.DoctorReferralImageUrl,
        totalFee = s.TotalFee,
        patientFee = s.PatientFee,
        conditionCase = s.ConditionCase,
        professionalFee = s.ProfessionalFee,
        locationFee = s.LocationFee,
        miscellaneousFee = s.MiscellaneousFee,
        status = s.Status.ToString(),
        cancellationReason = s.CancellationReason,
        cancelledBy = s.CancelledBy.HasValue ? s.CancelledBy.ToString() : null,
        patientCancellationReason = s.PatientCancellationReason,
        cancellationRequestedAt = s.CancellationRequestedAt,
        isPendingCancellation = s.Status == SessionStatus.PendingCancellation,
        isCancellationAcknowledged = s.Status == SessionStatus.CancellationAcknowledged,
        createdAt = s.CreatedAt,
        detailsProposedAt = s.DetailsProposedAt,
        detailsConfirmedAt = s.DetailsConfirmedAt,
        isAwaitingPatientConfirmation = s.Status == SessionStatus.PendingConfirmation,
        hasBeenRatedByPatient = hasBeenRatedByPatient,
        hasBeenRatedByTherapist = hasBeenRatedByTherapist,
        isRescheduled = s.IsRescheduled,
        rescheduledAt = s.RescheduledAt,
        proposedRescheduleStartAt = s.ProposedRescheduleStartAt,
        proposedRescheduleEndAt = s.ProposedRescheduleEndAt,
        rescheduleProposalReason = s.RescheduleProposalReason,
        rescheduleProposedAt = s.RescheduleProposedAt,
        relieverTherapistId = s.RelieverTherapistId,
        relieverTherapistName = relieverTherapistName,
        relieverTherapistSpecialty = relieverTherapistSpecialty,
        relieverSubstitutionReason = s.RelieverSubstitutionReason,
        isRelieverProposed = s.IsRelieverProposed
      };

      return Ok(dto);
    }

    /// <summary>
    /// Get sessions where the current therapist has been proposed as a reliever
    /// </summary>
    [HttpGet("reliever-proposals")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> GetRelieverProposals()
      => ToActionResult(await _sessions.GetRelieverProposalsAsync(User));

    /// <summary>
    /// Reliever therapist accepts the substitution request
    /// Changes status from PendingRelieverAcceptance to PendingRescheduleApproval
    /// Patient is notified after accept
    /// </summary>
    [HttpPost("{sessionId:int}/reliever/accept")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> AcceptRelieverProposal(int sessionId)
      => ToActionResult(await _sessions.AcceptRelieverProposalAsync(User, sessionId));

    /// <summary>
    /// Reliever therapist declines the substitution request
    /// Original therapist is notified
    /// </summary>
    [HttpPost("{sessionId:int}/reliever/decline")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> DeclineRelieverProposal(int sessionId)
      => ToActionResult(await _sessions.DeclineRelieverProposalAsync(User, sessionId));

    [HttpPost]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> Create([FromBody] CreateSessionRequest dto)
      => ToActionResult(await _sessions.CreateAsync(User, dto));

    [HttpPut("{sessionId:int}/cancel")]
    [Authorize(Roles = "PhysicalTherapist,Patient,Admin")]
    public async Task<IActionResult> Cancel(int sessionId, [FromBody] CancelSessionRequest body)
      => ToActionResult(await _sessions.CancelAsync(User, sessionId, body));

    /// <summary>
    /// Patient requests cancellation - puts session in PendingCancellation status
    /// </summary>
    [HttpPut("{sessionId:int}/request-cancellation")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> RequestCancellation(int sessionId, [FromBody] RequestCancellationRequest body)
      => ToActionResult(await _sessions.RequestCancellationAsync(User, sessionId, body));

    /// <summary>
    /// Therapist acknowledges patient's cancellation request.
    /// If reschedule dates are provided, proposes a new schedule (PendingRescheduleApproval).
    /// If no dates, finalizes the cancellation (Cancelled).
    /// </summary>
    [HttpPut("{sessionId:int}/acknowledge-cancellation")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> AcknowledgeCancellation(int sessionId, [FromBody] AcknowledgeCancellationRequest body)
      => ToActionResult(await _sessions.AcknowledgeCancellationAsync(User, sessionId, body));

    /// <summary>
    /// Patient approves the therapist's reschedule proposal and updates the session
    /// </summary>
    [HttpPut("{sessionId:int}/approve-reschedule")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> ApproveReschedule(int sessionId)
      => ToActionResult(await _sessions.ApproveRescheduleAsync(User, sessionId));

    /// <summary>
    /// Patient declines the therapist's reschedule proposal (withdraw proposal only)
    /// </summary>
    [HttpPut("{sessionId:int}/decline-reschedule")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> DeclineReschedule(int sessionId, [FromBody] DeclineRescheduleBindingModel? model = null)
      => ToActionResult(await _sessions.DeclineRescheduleAsync(User, sessionId, model));

    // List sessions by patient user id (for therapist context, chat, etc.)
    [HttpGet("by-patient-user/{userGuid:guid}")]
    [Authorize(Roles = "PhysicalTherapist,Patient,Admin")]
    public async Task<IActionResult> GetByPatientUser(Guid userGuid)
    {
      // Allow if caller is the same patient, a therapist, or admin
      var isSelf = User.FindFirst(ClaimTypes.NameIdentifier)?.Value == userGuid.ToString();
      if (!isSelf && !User.IsInRole("PhysicalTherapist") && !User.IsInRole("Admin"))
        return Forbid();

      var sessions = await _db.TherapySessions
          .AsNoTracking()
          .Include(s => s.Contract)
          .Include(s => s.Patient).ThenInclude(p => p!.User)
          .Include(s => s.PhysicalTherapist).ThenInclude(t => t!.User)
          .Where(s => s.Patient!.UserId == userGuid)
          .OrderByDescending(s => s.StartAt)
          .Select(s => new
          {
            id = s.Id,
            contractId = s.ContractId,
            patientId = s.PatientId,
            patientName = s.Patient != null ? ($"{s.Patient.FirstName} {s.Patient.LastName}").Trim() : null,
            physicalTherapistId = s.PhysicalTherapistId,
            therapistName = s.PhysicalTherapist != null ? ($"{s.PhysicalTherapist.User.FirstName} {s.PhysicalTherapist.User.LastName}").Trim() : null,
            therapistProfilePictureUrl = s.PhysicalTherapist != null ? s.PhysicalTherapist.ProfilePictureUrl : null,
            startAt = s.StartAt,
            endAt = s.EndAt,
            durationMinutes = s.DurationMinutes,
            status = s.Status.ToString(),
            contractStatus = s.Contract != null ? s.Contract.Status.ToString() : null,
            conditionCase = s.ConditionCase,
            locationAddress = s.LocationAddress,
            latitude = s.Latitude,
            longitude = s.Longitude,
            totalFee = s.TotalFee,
            patientFee = s.PatientFee,
            professionalFee = s.ProfessionalFee,
            locationFee = s.LocationFee,
            miscellaneousFee = s.MiscellaneousFee
          })
          .ToListAsync();

      return Ok(sessions);
    }

    [HttpPost("{sessionId:int}/log-today")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> LogTodaySession(int sessionId, [FromBody] LogTodayBindingModel model)
      => ToActionResult(await _sessions.LogTodaySessionAsync(sessionId, model));

    [HttpGet("{sessionId:int}/logs")]
    [Authorize(Roles = "PhysicalTherapist,Patient,Admin")]
    public async Task<IActionResult> GetSessionLogs(int sessionId)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var session = await _db.TherapySessions
          .AsNoTracking()
          .Include(s => s.Patient)
          .Include(s => s.PhysicalTherapist)
          .FirstOrDefaultAsync(s => s.Id == sessionId);

      if (session is null)
      {
        return NotFound();
      }

      // Verify the user is a participant or admin
      var isPatient = session.Patient?.UserId == guid;
      var isTherapist = session.PhysicalTherapist?.UserId == guid;
      if (!isPatient && !isTherapist && !User.IsInRole("Admin"))
      {
        return Forbid();
      }

      var logs = await _db.SessionLogs
          .Where(l => l.TherapySessionId == sessionId)
          .OrderByDescending(l => l.Date)
          .Select(l => new SessionLogDto
          {
            Id = l.Id,
            StartTime = l.StartTime,
            EndTime = l.EndTime,
            Date = l.Date
          })
          .ToListAsync();

      return Ok(logs);
    }

    [HttpPut("{sessionId:int}/mark-as-done")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> MarkAsDone(int sessionId)
      => ToActionResult(await _sessions.MarkAsDoneAsync(sessionId));

    /// <summary>
    /// Reschedule a cancelled session to a new time slot.
    /// Only the assigned therapist or admin can reschedule.
    /// The new time must be in the future and within the therapist's weekly availability.
    /// </summary>
    [HttpPut("{sessionId:int}/reschedule")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> Reschedule(int sessionId, [FromBody] RescheduleSessionRequest body)
      => ToActionResult(await _sessions.RescheduleAsync(User, sessionId, body));

    /// <summary>
    /// Returns the current server time in UTC milliseconds for client-server time synchronization.
    /// Clients can use this to calculate their clock offset and display synchronized timers.
    /// </summary>
    [HttpGet("server-time")]
    [AllowAnonymous]
    public IActionResult GetServerTime()
    {
      var serverTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
      return Ok(new { serverTimeMs });
    }

  }
}
