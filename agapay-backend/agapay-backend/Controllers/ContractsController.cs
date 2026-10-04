using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using agapay_backend.Services.Sessions;
using agapay_backend.Services.Contracts;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize]
  public class ContractsController : ControllerBase
  {
    private readonly agapayDbContext _db;
    private readonly ISessionService _sessions;
    private readonly IContractBlueprintService _blueprints;
    private readonly ILogger<ContractsController> _logger;
    public ContractsController(agapayDbContext db, ISessionService sessions, IContractBlueprintService blueprints, ILogger<ContractsController> logger)
    {
      _db = db;
      _sessions = sessions;
      _blueprints = blueprints;
      _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateContractDto dto)
    {
      if (dto.EndDate <= dto.StartDate)
        return BadRequest("EndDate must be after StartDate");

      var patient = await _db.Patients.FindAsync(dto.PatientId);
      if (patient == null) return NotFound("Patient not found");
      var therapist = await _db.PhysicalTherapists.FindAsync(dto.PhysicalTherapistId);
      if (therapist == null) return NotFound("Therapist not found");

      // Optionally enforce that caller is either patient user or therapist user
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId == null) return Unauthorized();
      var callerGuid = Guid.Parse(userId);
      var isPatientUser = patient.UserId == callerGuid;
      var isTherapistUser = therapist.UserId == callerGuid;
      if (!User.IsInRole("Admin") && !isPatientUser && !isTherapistUser)
        return Forbid();

      // Check if patient already has an active contract with ANY therapist
      // A patient can only have one active therapist at a time
      var existingActiveContract = await _db.Contracts
        .AsNoTracking()
        .Where(c => c.PatientId == dto.PatientId &&
                    (c.Status == ContractStatus.Draft ||
                     c.Status == ContractStatus.PendingConfirmation ||
                     c.Status == ContractStatus.Active))
        .Select(c => new { c.Id, c.PhysicalTherapistId, c.Status })
        .FirstOrDefaultAsync();

      if (existingActiveContract != null)
      {
        // If the existing contract is with a different therapist, block the creation
        if (existingActiveContract.PhysicalTherapistId != dto.PhysicalTherapistId)
        {
          return Conflict(new
          {
            message = "This patient already has an active contract with another therapist. A patient can only have one therapist at a time.",
            existingContractId = existingActiveContract.Id,
            existingTherapistId = existingActiveContract.PhysicalTherapistId,
            code = "PATIENT_HAS_ACTIVE_CONTRACT"
          });
        }
        // If the existing contract is with the same therapist, return the existing contract
        else
        {
          return Ok(new { Id = existingActiveContract.Id, existing = true });
        }
      }

      var contract = new Contract
      {
        PatientId = dto.PatientId,
        PhysicalTherapistId = dto.PhysicalTherapistId,
        StartDate = dto.StartDate,
        EndDate = dto.EndDate,
        // Contracts start as Draft until therapist sets blueprint
        Status = ContractStatus.Draft,
        CreatedAt = DateTime.UtcNow
      };

      _db.Contracts.Add(contract);
      await _db.SaveChangesAsync();
      return Ok(new { contract.Id });
    }

    [HttpGet("{contractId:int}")]
    public async Task<IActionResult> GetById(int contractId)
    {
      var contract = await _db.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.Id == contractId);
      if (contract == null) return NotFound();

      // Only participants or admin can view
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId == null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var isPatientUser = await _db.Patients.AsNoTracking().AnyAsync(p => p.Id == contract.PatientId && p.UserId == guid);
      var isTherapistUser = await _db.PhysicalTherapists.AsNoTracking().AnyAsync(t => t.Id == contract.PhysicalTherapistId && t.UserId == guid);
      if (!User.IsInRole("Admin") && !isPatientUser && !isTherapistUser)
        return Forbid();

      var dto = new ContractDetailDto
      {
        Id = contract.Id,
        PatientId = contract.PatientId,
        PhysicalTherapistId = contract.PhysicalTherapistId,
        StartDate = contract.StartDate,
        EndDate = contract.EndDate,
        Status = contract.Status.ToString(),
        CaseToTreat = contract.CaseToTreat,
        SessionDays = contract.SessionDays,
        SessionStartTime = contract.SessionStartTime,
        SessionEndTime = contract.SessionEndTime,
        ProfessionalFee = contract.ProfessionalFee,
        LocationFee = contract.LocationFee,
        MiscellaneousFee = contract.MiscellaneousFee,
        TotalFee = contract.TotalFee,
        BlueprintProposedAt = contract.BlueprintProposedAt,
        BlueprintConfirmedAt = contract.BlueprintConfirmedAt
      };
      return Ok(dto);
    }

    [HttpGet("therapist/{therapistId:int}/recurring-commitments")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> GetRecurringCommitments(int therapistId, [FromQuery] int? excludeContractId = null)
    {
      if (!User.IsInRole("Admin"))
      {
        var me = await User.GetForCallerAsync(_db);
        if (me == null || me.Id != therapistId)
          return Forbid();
      }

      var contracts = await _db.Contracts
        .AsNoTracking()
        .Where(c =>
          c.PhysicalTherapistId == therapistId &&
          c.SessionStartTime != null &&
          c.SessionEndTime != null &&
          !string.IsNullOrWhiteSpace(c.SessionDays) &&
          (c.Status == ContractStatus.Active ||
           c.Status == ContractStatus.PendingConfirmation ||
           c.Status == ContractStatus.Draft))
        .Select(c => new
        {
          c.Id,
          c.SessionDays,
          c.SessionStartTime,
          c.SessionEndTime,
          c.Status
        })
        .ToListAsync();

      if (excludeContractId.HasValue)
      {
        contracts = contracts
          .Where(c => c.Id != excludeContractId.Value)
          .ToList();
      }

      var commitments = new List<RecurringCommitmentDto>();
      foreach (var contract in contracts)
      {
        var dayTokens = (contract.SessionDays ?? string.Empty)
          .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var token in dayTokens)
        {
          var day = SessionDaysParser.ParseDayOfWeek(token);
          if (!day.HasValue) continue;

          commitments.Add(new RecurringCommitmentDto
          {
            ContractId = contract.Id,
            DayOfWeek = (int)day.Value,
            StartTime = contract.SessionStartTime!.Value.ToString("HH:mm:ss"),
            EndTime = contract.SessionEndTime!.Value.ToString("HH:mm:ss"),
            Status = contract.Status.ToString()
          });
        }
      }

      return Ok(commitments);
    }

    // Therapist-only: set or update blueprint details
    [HttpPut("{contractId:int}/blueprint")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> UpdateBlueprint(int contractId, UpdateContractBlueprintDto dto)
      => ToActionResult(await _blueprints.UpdateBlueprintAsync(User, contractId, dto));

    // Therapist-only: send blueprint for patient confirmation
    [HttpPost("{contractId:int}/send-for-confirmation")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> SendBlueprintForConfirmation(int contractId)
      => ToActionResult(await _blueprints.SendBlueprintForConfirmationAsync(User, contractId));

    // Patient-only: confirm blueprint to activate contract
    [HttpPost("{contractId:int}/confirm")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> ConfirmBlueprint(int contractId)
      => ToActionResult(await _blueprints.ConfirmBlueprintAsync(User, contractId));

    // Patient-only: decline blueprint and revert contract to draft
    [HttpPost("{contractId:int}/decline")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> DeclineBlueprint(int contractId)
      => ToActionResult(await _blueprints.DeclineBlueprintAsync(User, contractId));

    // Therapist-only: end contract with status (Completed or Terminated)
    [HttpPost("{contractId:int}/end")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> EndContract(int contractId, [FromBody] EndContractDto dto)
      => ToActionResult(await _blueprints.EndContractAsync(User, contractId, dto));

    [HttpPut("sessions/{sessionId:int}/start")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> StartSession(int sessionId)
      => ToActionResult(await _sessions.StartSessionAsync(sessionId));

    [HttpPut("sessions/{sessionId:int}/complete")]
    [Authorize(Roles = "PhysicalTherapist,Admin")]
    public async Task<IActionResult> CompleteSession(int sessionId)
      => ToActionResult(await _sessions.CompleteSessionAsync(sessionId));

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

    // Same mapping for ContractActionResult results returned by the
    // blueprint endpoints extracted into IContractBlueprintService.
    private IActionResult ToActionResult(ContractActionResult result)
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


    [HttpGet("patient/{patientId:int}")]
    public async Task<IActionResult> GetForPatient(int patientId)
    {
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId == null) return Unauthorized();
      if (!Guid.TryParse(userId, out var callerGuid)) return Unauthorized();

      IQueryable<Contract> query = _db.Contracts.AsNoTracking();

      if (User.IsInRole("Admin"))
      {
        query = query.Where(c => c.PatientId == patientId);
      }
      else if (User.IsInRole("Patient"))
      {
        // Patients may only list their own contracts.
        var callerPatient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == callerGuid);
        if (callerPatient == null || callerPatient.Id != patientId) return Forbid();
        query = query.Where(c => c.PatientId == patientId);
      }
      else if (User.IsInRole("PhysicalTherapist"))
      {
        // Therapists may only see a patient's contracts they themselves participate in.
        var callerTherapist = await _db.PhysicalTherapists.AsNoTracking().FirstOrDefaultAsync(t => t.UserId == callerGuid);
        if (callerTherapist == null) return Forbid();
        query = query.Where(c => c.PatientId == patientId && c.PhysicalTherapistId == callerTherapist.Id);
      }
      else
      {
        return Forbid();
      }

      var contracts = await query
          .Select(c => new { c.Id, c.PatientId, c.PhysicalTherapistId, c.StartDate, c.EndDate, c.Status })
          .ToListAsync();
      return Ok(contracts);
    }

    [HttpGet("therapist/{therapistId:int}")]
    public async Task<IActionResult> GetForTherapist(int therapistId)
    {
      var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
      if (userId == null) return Unauthorized();
      if (!Guid.TryParse(userId, out var callerGuid)) return Unauthorized();

      IQueryable<Contract> query = _db.Contracts.AsNoTracking();

      if (User.IsInRole("Admin"))
      {
        query = query.Where(c => c.PhysicalTherapistId == therapistId);
      }
      else if (User.IsInRole("PhysicalTherapist"))
      {
        // Therapists may only list their own contracts.
        var callerTherapist = await _db.PhysicalTherapists.AsNoTracking().FirstOrDefaultAsync(t => t.UserId == callerGuid);
        if (callerTherapist == null || callerTherapist.Id != therapistId) return Forbid();
        query = query.Where(c => c.PhysicalTherapistId == therapistId);
      }
      else if (User.IsInRole("Patient"))
      {
        // Patients may only see a therapist's contracts they themselves participate in.
        var callerPatient = await _db.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.UserId == callerGuid);
        if (callerPatient == null) return Forbid();
        query = query.Where(c => c.PhysicalTherapistId == therapistId && c.PatientId == callerPatient.Id);
      }
      else
      {
        return Forbid();
      }

      var contracts = await query
          .Select(c => new { c.Id, c.PatientId, c.PhysicalTherapistId, c.StartDate, c.EndDate, c.Status })
          .ToListAsync();
      return Ok(contracts);
    }

    [HttpPut("{contractId:int}/status")]
    [Authorize(Roles = "Admin")] // contract status otherwise changes only through the blueprint/session endpoints
    public async Task<IActionResult> UpdateStatus(int contractId, [FromBody] ContractStatus status)
    {
      var contract = await _db.Contracts.FindAsync(contractId);
      if (contract == null) return NotFound();
      contract.Status = status;
      if (status is ContractStatus.Completed or ContractStatus.Cancelled or ContractStatus.Expired or ContractStatus.Terminated)
      {
        contract.EndDate = DateTime.UtcNow;
      }
      await _db.SaveChangesAsync();
      return Ok();
    }

    [HttpGet("me/unreviewed")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> GetMyUnreviewedContracts()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var patient = await _db.Patients
          .AsNoTracking()
          .FirstOrDefaultAsync(p => p.UserId == guid);

      if (patient == null) return Ok(Array.Empty<object>());

      var contracts = await _db.Contracts
          .AsNoTracking()
          .Include(c => c.PhysicalTherapist).ThenInclude(t => t!.User)
          .Where(c => c.PatientId == patient.Id)
          .Where(c => c.Status == ContractStatus.Completed || c.Status == ContractStatus.Terminated)
          .Where(c => !_db.TherapistRatings.Any(r => r.ContractId == c.Id && r.PatientId == patient.Id))
          .OrderByDescending(c => c.EndDate)
          .Select(c => new
          {
            id = c.Id,
            patientId = c.PatientId,
            physicalTherapistId = c.PhysicalTherapistId,
            therapistName = c.PhysicalTherapist != null ? ($"{c.PhysicalTherapist.User.FirstName} {c.PhysicalTherapist.User.LastName}").Trim() : null,
            therapistProfilePictureUrl = c.PhysicalTherapist != null ? c.PhysicalTherapist.ProfilePictureUrl : null,
            startDate = c.StartDate,
            endDate = c.EndDate,
            status = c.Status.ToString(),
            caseToTreat = c.CaseToTreat,
          })
          .ToListAsync();

      return Ok(contracts);
    }

    [HttpGet("therapist/unreviewed")]
    [Authorize(Roles = "Therapist")]
    public async Task<IActionResult> GetTherapistUnreviewedContracts()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var therapist = await _db.PhysicalTherapists
          .AsNoTracking()
          .FirstOrDefaultAsync(pt => pt.UserId == guid);

      if (therapist == null) return Ok(Array.Empty<object>());

      var contracts = await _db.Contracts
          .AsNoTracking()
          .Include(c => c.Patient).ThenInclude(p => p!.User)
          .Where(c => c.PhysicalTherapistId == therapist.Id)
          .Where(c => c.Status == ContractStatus.Completed || c.Status == ContractStatus.Terminated)
          .Where(c => !_db.PatientRatings.Any(r => r.ContractId == c.Id && r.PhysicalTherapistId == therapist.Id))
          .OrderByDescending(c => c.EndDate)
          .Select(c => new
          {
            id = c.Id,
            patientId = c.PatientId,
            physicalTherapistId = c.PhysicalTherapistId,
            patientName = c.Patient != null ? ($"{c.Patient.User.FirstName} {c.Patient.User.LastName}").Trim() : null,
            patientProfilePictureUrl = c.Patient != null ? c.Patient.User.ProfilePictureUrl : null,
            startDate = c.StartDate,
            endDate = c.EndDate,
            status = c.Status.ToString(),
            caseToTreat = c.CaseToTreat,
          })
          .ToListAsync();

      return Ok(contracts);
    }
  }
}
