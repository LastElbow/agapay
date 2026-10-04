using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Models;
using agapay_backend.Services;
using agapay_backend.Services.Profiles;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class PatientController : ControllerBase
  {
    private readonly agapayDbContext _context;
    private readonly UserManager<User> _userManager;
    private readonly ISupabaseStorageService _storageService;
    private readonly IHubContext<SessionsHub> _sessionsHub;
    private readonly IProfilePhotoService _profilePhotoService;

    public PatientController(
      agapayDbContext context,
      UserManager<User> userManager,
      ISupabaseStorageService storageService,
      IHubContext<SessionsHub> sessionsHub,
      IProfilePhotoService profilePhotoService)
    {
      _context = context;
      _userManager = userManager;
      _storageService = storageService;
      _sessionsHub = sessionsHub;
      _profilePhotoService = profilePhotoService;
    }

    // POST /api/patient/profile-picture - Upload profile picture for the logged-in patient
    [HttpPost("profile-picture")]
    [Authorize(Roles = "Patient,Admin")]
    [RequestSizeLimit(10_000_000)] // 10MB limit
    public async Task<IActionResult> UploadProfilePicture([FromForm] IFormFile profilePicture)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == guid);
      if (user is null) return Unauthorized();

      if (profilePicture == null || profilePicture.Length == 0)
      {
        return BadRequest("No file uploaded");
      }

      // Validate file type
      var allowedTypes = new[] { "image/jpeg", "image/png", "image/webp", "image/gif" };
      if (!allowedTypes.Contains(profilePicture.ContentType.ToLower()))
      {
        return BadRequest("Invalid file type. Allowed types: JPEG, PNG, WebP, GIF");
      }

      try
      {
        var uploaded = await _profilePhotoService.UploadAsync(profilePicture, $"patient-profiles/{guid}", user.ProfilePictureUrl);
        user.ProfilePictureUrl = uploaded.UploadedPath;
        user.UpdatedAt = DateTime.UtcNow;

        await _userManager.UpdateAsync(user);
        await _context.SaveChangesAsync();

        return Ok(new
        {
          message = "Profile picture uploaded successfully",
          profilePictureUrl = uploaded.DisplayUrl
        });
      }
      catch (Exception ex)
      {
        return StatusCode(500, new { message = "Failed to upload profile picture", error = ex.Message });
      }
    }

    // GET /api/patient/profile-picture - Get signed URL for current user's profile picture
    [HttpGet("profile-picture")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> GetProfilePicture()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == guid);
      if (user is null) return Unauthorized();

      if (string.IsNullOrWhiteSpace(user.ProfilePictureUrl))
      {
        return Ok(new { profilePictureUrl = (string?)null });
      }

      var displayUrl = await _storageService.ResolveUrlAsync(user.ProfilePictureUrl, 3600);

      return Ok(new { profilePictureUrl = displayUrl });
    }

    // Lookup patient master account by underlying User GUID (not patient profiles)
    // Returns basic account details suitable for chat user profile view
    [HttpGet("by-user/{userGuid:guid}")]
    [Authorize(Roles = "Patient,PhysicalTherapist,Admin")]
    public async Task<IActionResult> GetPatientMasterByUserId(Guid userGuid)
    {
      var user = await _context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userGuid);
      if (user is null)
      {
        return NotFound("User not found");
      }

      // Optional: pick the active patient profile to enrich minimal location context
      var activeProfile = await _context.Patients
        .AsNoTracking()
        .Where(p => p.UserId == userGuid && p.IsActive)
        .Select(p => new
        {
          id = p.Id,
          firstName = p.FirstName,
          lastName = p.LastName,
          address = p.Address,
          barangay = p.Barangay,
          latitude = p.Latitude,
          longitude = p.Longitude,
          relationshipToUser = p.RelationshipToUser,
          currentComplaints = p.CurrentComplaints,
          activityLevel = p.ActivityLevel,
          occupation = p.Occupation
        })
        .FirstOrDefaultAsync();

      return Ok(new
      {
        userId = user.Id,
        email = user.Email,
        firstName = user.FirstName,
        lastName = user.LastName,
        phoneNumber = user.PhoneNumber,
        profilePictureUrl = user.ProfilePictureUrl,
        activeProfile
      });
    }

    // GET /api/patient/me - Get the logged-in patient's own profile
    [HttpGet("me")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> GetMyProfile()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var patient = await _context.Patients
        .AsNoTracking()
        .Include(p => p.User)
        .FirstOrDefaultAsync(p => p.UserId == guid);

      if (patient is null)
      {
        return NotFound("Patient profile not found");
      }

      // Get profile picture URL if available
      string? profilePictureUrl = null;
      if (!string.IsNullOrWhiteSpace(patient.User?.ProfilePictureUrl))
      {
        profilePictureUrl = await _storageService.ResolveUrlAsync(patient.User.ProfilePictureUrl, 3600);
      }

      return Ok(new
      {
        id = patient.Id,
        firstName = patient.FirstName,
        lastName = patient.LastName,
        dateOfBirth = patient.DateOfBirth,
        relationshipToUser = patient.RelationshipToUser,
        gender = patient.Gender,
        address = patient.Address,
        barangay = patient.Barangay,
        latitude = patient.Latitude,
        longitude = patient.Longitude,
        occupation = patient.Occupation,
        activityLevel = patient.ActivityLevel,
        currentComplaints = patient.CurrentComplaints,
        isActive = patient.IsActive,
        isOnboardingComplete = patient.IsOnboardingComplete,
        profilePictureUrl = profilePictureUrl
      });
    }

    // GET /api/patient/profiles/{id} - Get a specific patient profile by ID (for therapists)
    [HttpGet("profiles/{id:int}")]
    [Authorize(Roles = "Patient,PhysicalTherapist,Admin")]
    public async Task<IActionResult> GetPatientProfile(int id)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      Patient? patient = null;

      if (User.IsInRole("Admin"))
      {
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
      }
      else if (User.IsInRole("Patient"))
      {
        // Patients can only view their own profile
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.UserId == guid);
      }
      else if (User.IsInRole("PhysicalTherapist"))
      {
        // Therapists can view any patient profile
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
      }

      if (patient is null)
      {
        return NotFound("Patient profile not found");
      }

      return Ok(new
      {
        id = patient.Id,
        firstName = patient.FirstName,
        lastName = patient.LastName,
        dateOfBirth = patient.DateOfBirth,
        relationshipToUser = patient.RelationshipToUser,
        gender = patient.Gender,
        address = patient.Address,
        barangay = patient.Barangay,
        latitude = patient.Latitude,
        longitude = patient.Longitude,
        occupation = patient.Occupation,
        activityLevel = patient.ActivityLevel,
        currentComplaints = patient.CurrentComplaints,
        isActive = patient.IsActive,
        isOnboardingComplete = patient.IsOnboardingComplete
      });
    }

    // GET /api/patient/profiles/{id}/cancellation-history - Cancellation history for credibility tracking
    [HttpGet("profiles/{id:int}/cancellation-history")]
    [Authorize(Roles = "Patient,PhysicalTherapist,Admin")]
    public async Task<IActionResult> GetPatientCancellationHistory(int id)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      Patient? patient = null;

      if (User.IsInRole("Admin"))
      {
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
      }
      else if (User.IsInRole("Patient"))
      {
        // Patients can only view their own cancellation history
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.UserId == guid);
      }
      else if (User.IsInRole("PhysicalTherapist"))
      {
        // Therapists can view any patient's cancellation history
        patient = await _context.Patients.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
      }

      if (patient is null)
      {
        return NotFound("Patient profile not found");
      }

      var cancelledSessionsQuery = _context.TherapySessions
        .AsNoTracking()
        .Where(s => s.PatientId == id && s.Status == SessionStatus.Cancelled);

      var cancelledBreakdown = await cancelledSessionsQuery
        .GroupBy(s => s.CancelledBy)
        .Select(g => new
        {
          cancelledBy = g.Key,
          count = g.Count(),
        })
        .ToListAsync();

      var totalCancelled = cancelledBreakdown.Sum(x => x.count);
      var cancelledByPatient = cancelledBreakdown
        .Where(x => x.cancelledBy.HasValue && x.cancelledBy.Value == CancellationInitiator.Patient)
        .Select(x => x.count)
        .FirstOrDefault();
      var cancelledByTherapist = cancelledBreakdown
        .Where(x => x.cancelledBy.HasValue && x.cancelledBy.Value == CancellationInitiator.Therapist)
        .Select(x => x.count)
        .FirstOrDefault();

      const int take = 10;
      var items = await cancelledSessionsQuery
        .OrderByDescending(s => s.CancelledAt ?? s.StartAt)
        .Take(take)
        .Select(s => new
        {
          sessionId = s.Id,
          startAt = s.StartAt,
          endAt = s.EndAt,
          conditionCase = s.ConditionCase,
          cancelledBy = s.CancelledBy.HasValue ? s.CancelledBy.ToString() : null,
          cancelledAt = s.CancelledAt,
        })
        .ToListAsync();

      return Ok(new
      {
        totalCancelled,
        cancelledByPatient,
        cancelledByTherapist,
        items,
      });
    }

    // PUT /api/patient/profiles/{id}/location - Update location for a specific patient profile
    [HttpPut("profiles/{id:int}/location")]
    [Authorize(Roles = "Patient,PhysicalTherapist,Admin")]
    public async Task<IActionResult> UpdatePatientLocation(int id, [FromBody] UpdateLocationDto dto)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      Patient? patient = null;

      if (User.IsInRole("Admin"))
      {
        patient = await _context.Patients.FirstOrDefaultAsync(p => p.Id == id);
      }
      else if (User.IsInRole("Patient"))
      {
        // Patients can only update their own location
        patient = await _context.Patients.FirstOrDefaultAsync(p => p.Id == id && p.UserId == guid);
      }
      else if (User.IsInRole("PhysicalTherapist"))
      {
        // Therapists can update any patient's location (for session purposes)
        patient = await _context.Patients.FirstOrDefaultAsync(p => p.Id == id);
      }

      if (patient is null)
      {
        return NotFound("Patient profile not found");
      }

      patient.Latitude = dto.Latitude;
      patient.Longitude = dto.Longitude;

      if (!string.IsNullOrWhiteSpace(dto.Address))
      {
        patient.Address = dto.Address;
      }

      await _context.SaveChangesAsync();

      // Broadcast location update to all connected clients
      await _sessionsHub.Clients.All.SendAsync("PatientLocationUpdated", new
      {
        patientId = patient.Id,
        latitude = patient.Latitude,
        longitude = patient.Longitude,
        address = patient.Address
      });

      return Ok(new
      {
        id = patient.Id,
        latitude = patient.Latitude,
        longitude = patient.Longitude,
        address = patient.Address,
        message = "Location updated successfully"
      });
    }

    // PUT /api/patient/me - Update the logged-in patient's own profile
    [HttpPut("me")]
    [Authorize(Roles = "Patient,Admin")]
    public async Task<IActionResult> UpdateMyProfile([FromBody] UpdatePatientProfileDto dto)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == guid);
      if (user is null) return Unauthorized();

      var patient = await _context.Patients.FirstOrDefaultAsync(p => p.UserId == guid);

      if (patient is null)
      {
        // If no patient profile exists, create one (edge case handling)
        var fallbackFirst = string.IsNullOrWhiteSpace(dto.FirstName) ? user.FirstName : dto.FirstName!.Trim();
        var fallbackLast = string.IsNullOrWhiteSpace(dto.LastName) ? user.LastName : dto.LastName!.Trim();
        var fallbackDob = dto.DateOfBirth ?? user.DateOfBirth;

        patient = new Patient
        {
          UserId = guid,
          User = user,
          FirstName = fallbackFirst,
          LastName = fallbackLast,
          DateOfBirth = fallbackDob,
          RelationshipToUser = "Self",
          Gender = string.IsNullOrWhiteSpace(dto.Gender) ? null : dto.Gender!.Trim(),
          Address = dto.Address,
          Barangay = dto.Barangay,
          Latitude = dto.Latitude,
          Longitude = dto.Longitude,
          Occupation = dto.Occupation,
          ActivityLevel = dto.ActivityLevel,
          CurrentComplaints = dto.CurrentComplaints,
          IsActive = true,
          IsOnboardingComplete = true
        };
        _context.Patients.Add(patient);
      }
      else
      {
        // Update existing patient profile
        if (!string.IsNullOrWhiteSpace(dto.FirstName)) patient.FirstName = dto.FirstName!.Trim();
        if (!string.IsNullOrWhiteSpace(dto.LastName)) patient.LastName = dto.LastName!.Trim();
        if (dto.DateOfBirth is not null) patient.DateOfBirth = dto.DateOfBirth.Value;
        if (dto.Gender is not null)
          patient.Gender = string.IsNullOrWhiteSpace(dto.Gender) ? null : dto.Gender.Trim();
        if (!string.IsNullOrWhiteSpace(dto.Address)) patient.Address = dto.Address!;
        if (dto.Barangay is not null && dto.Barangay.Trim().Length > 0) patient.Barangay = dto.Barangay!;
        if (dto.Latitude is not null) patient.Latitude = dto.Latitude;
        if (dto.Longitude is not null) patient.Longitude = dto.Longitude;
        if (!string.IsNullOrWhiteSpace(dto.Occupation)) patient.Occupation = dto.Occupation!;
        if (!string.IsNullOrWhiteSpace(dto.ActivityLevel)) patient.ActivityLevel = dto.ActivityLevel!;
        if (!string.IsNullOrWhiteSpace(dto.CurrentComplaints)) patient.CurrentComplaints = dto.CurrentComplaints!;

        patient.IsOnboardingComplete = true;
      }

      // Sync user account details with patient profile
      var effectiveFirstName = !string.IsNullOrWhiteSpace(dto.FirstName)
        ? dto.FirstName!.Trim()
        : patient.FirstName;
      var effectiveLastName = !string.IsNullOrWhiteSpace(dto.LastName)
        ? dto.LastName!.Trim()
        : patient.LastName;
      var effectiveDob = dto.DateOfBirth ?? patient.DateOfBirth;

      var userNeedsUpdate = false;
      if (!string.Equals(user.FirstName, effectiveFirstName, StringComparison.Ordinal))
      {
        user.FirstName = effectiveFirstName;
        userNeedsUpdate = true;
      }
      if (!string.Equals(user.LastName, effectiveLastName, StringComparison.Ordinal))
      {
        user.LastName = effectiveLastName;
        userNeedsUpdate = true;
      }
      if (user.DateOfBirth != effectiveDob)
      {
        user.DateOfBirth = effectiveDob;
        userNeedsUpdate = true;
      }

      if (userNeedsUpdate)
      {
        user.UpdatedAt = DateTime.UtcNow;
        var identityResult = await _userManager.UpdateAsync(user);
        if (!identityResult.Succeeded)
        {
          return StatusCode(StatusCodes.Status500InternalServerError, new
          {
            message = "Failed to update account details",
            errors = identityResult.Errors
          });
        }
      }

      await _context.SaveChangesAsync();

      // Broadcast location update if latitude/longitude were changed
      if (dto.Latitude != null || dto.Longitude != null)
      {
        await _sessionsHub.Clients.All.SendAsync("PatientLocationUpdated", new
        {
          patientId = patient.Id,
          latitude = patient.Latitude,
          longitude = patient.Longitude,
          address = patient.Address
        });
      }

      return Ok(new
      {
        id = patient.Id,
        firstName = patient.FirstName,
        lastName = patient.LastName,
        dateOfBirth = patient.DateOfBirth,
        relationshipToUser = patient.RelationshipToUser,
        gender = patient.Gender,
        address = patient.Address,
        barangay = patient.Barangay,
        latitude = patient.Latitude,
        longitude = patient.Longitude,
        occupation = patient.Occupation,
        activityLevel = patient.ActivityLevel,
        currentComplaints = patient.CurrentComplaints,
        isActive = patient.IsActive,
        isOnboardingComplete = patient.IsOnboardingComplete
      });
    }
  }
}
