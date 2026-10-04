using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using agapay_backend.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  [Authorize]
  public class OnboardingController : ControllerBase
  {
    private readonly agapayDbContext _context;
    private readonly UserManager<User> _userManager;
    private readonly ISupabaseStorageService _storageService;
    private readonly ILogger<OnboardingController> _logger;

    public OnboardingController(agapayDbContext context, UserManager<User> userManager, ISupabaseStorageService storageService, ILogger<OnboardingController> logger)
    {
      _logger = logger;
      _context = context;
      _userManager = userManager;
      _storageService = storageService;
    }

    // Accept multipart/form-data - license image uploaded from phone
    [HttpPost("therapist/submit-license")]
    [Authorize]
    [RequestSizeLimit(25_000_000)] // allow up to ~25MB uploads from mobile
    public async Task<IActionResult> SubmitTherapistLicense([FromForm] TherapistLicenseSubmissionDto licenseDto, [FromForm] IFormFile? licenseImage)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var userGuid = Guid.Parse(userId);

      // Try to find existing therapist record for this user
      var therapist = await _context.PhysicalTherapists
          .FirstOrDefaultAsync(pt => pt.UserId == userGuid);

      // If a record exists and already has a pending submission with an uploaded image, block duplicate uploads.
      if (therapist is not null &&
          therapist.VerificationStatus == VerificationStatus.Pending &&
          !string.IsNullOrWhiteSpace(therapist.LicenseImageUrl))
      {
        // Return 409 Conflict with the stored object path (so frontend can show pending screen)
        return Conflict(new
        {
          message = "Verification pending. You cannot submit another license while your verification is under review.",
          licenseImagePath = therapist.LicenseImageUrl,
          submittedAt = therapist.SubmittedAt
        });
      }

      // Enforce file presence. If null/empty, return a clear error so client can show a message.
      if (licenseImage == null || licenseImage.Length == 0)
      {
        return BadRequest(new { error = "No license image received. Ensure the field name is 'licenseImage' and send multipart/form-data." });
      }

      string? uploadedObjectPath = null;

      // Upload the provided image to Supabase Storage and capture the returned object path
      try
      {
        uploadedObjectPath = await _storageService.UploadFileAsync(licenseImage, "licenses");
      }
      catch (Exception ex)
      {
        return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to upload license image", detail = ex.Message });
      }

      // If no record exists, create one (only once) and set status to Pending.
      if (therapist is null)
      {
        var user = await _userManager.FindByIdAsync(userId);
        if (user is null)
        {
          // Fallback to the underlying DbContext in case the user manager cache misses
          user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userGuid);

          if (user is null)
          {
            var userEmail = User.FindFirst(ClaimTypes.Email)?.Value;
            if (!string.IsNullOrEmpty(userEmail))
            {
              user = await _userManager.FindByEmailAsync(userEmail);
            }
          }

          if (user is null)
          {
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
              error = "Unable to locate authenticated user for license submission.",
              code = "USER_RECORD_MISSING"
            });
          }
        }

        // Safety check to avoid duplicates (concurrent requests)
        if (await _context.PhysicalTherapists.AnyAsync(pt => pt.UserId == userGuid))
        {
          therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(pt => pt.UserId == userGuid);
        }
        else
        {
          therapist = new PhysicalTherapist
          {
            UserId = userGuid,
            User = user,
            LicenseNumber = licenseDto.LicenseNumber ?? string.Empty,
            LicenseImageUrl = uploadedObjectPath, // store object path
            Gender = licenseDto.Gender?.Trim() ?? user.Gender?.Trim(), // Use Gender from DTO first, fallback to User.Gender
            SubmittedAt = DateTime.UtcNow,
            VerificationStatus = VerificationStatus.Pending,
            IsOnboardingComplete = false
          };
          _context.PhysicalTherapists.Add(therapist);
        }
      }
      else
      {
        // If therapist already verified, don't allow resubmission
        if (therapist.VerificationStatus == VerificationStatus.Verified)
        {
          return BadRequest("Physical therapist already verified");
        }

        // If therapist was rejected, allow resubmission — update license info and set to pending
        therapist.LicenseNumber = licenseDto.LicenseNumber ?? therapist.LicenseNumber;

        // If a new file was uploaded, update the stored object path; otherwise keep existing
        if (!string.IsNullOrEmpty(uploadedObjectPath))
        {
          // If there was a previous license image path, attempt to delete it (best-effort)
          if (!string.IsNullOrEmpty(therapist.LicenseImageUrl))
          {
            try
            {
              await _storageService.DeleteFileAsync(therapist.LicenseImageUrl);
            }
            catch
            {
              // swallow; not fatal for resubmission
            }
          }

          therapist.LicenseImageUrl = uploadedObjectPath;
        }

        therapist.SubmittedAt = DateTime.UtcNow;
        therapist.VerificationStatus = VerificationStatus.Pending;
      }

      await _context.SaveChangesAsync();

      // Ensure the user has the PhysicalTherapist role so they can sign in under that role
      var userForRole = await _userManager.FindByIdAsync(userId);
      if (userForRole is not null)
      {
        var existingRoles = await _userManager.GetRolesAsync(userForRole);
        if (!existingRoles.Contains("PhysicalTherapist"))
        {
          await _userManager.AddToRoleAsync(userForRole, "PhysicalTherapist");
        }
      }

      // Do not return the full public URL here; return the stored path and let the client request preview via a protected admin route or let UI construct preview if appropriate.
      return Ok(new
      {
        message = "License information submitted successfully",
        status = "Pending",
        licenseImagePath = therapist!.LicenseImageUrl,
        submittedAt = therapist.SubmittedAt
      });
    }

    [HttpGet("therapist/verification-status")]
    [Authorize]
    public async Task<IActionResult> GetVerificationStatus()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapist = await _context.PhysicalTherapists
          .FirstOrDefaultAsync(pt => pt.UserId == Guid.Parse(userId));

      if (therapist is null)
      {
        // No submission yet — client can show role selection or submission screen
        return Ok(new
        {
          status = (string?)null,
          submittedAt = (DateTime?)null,
          verifiedAt = (DateTime?)null,
          rejectionReason = (string?)null,
          licenseImagePath = (string?)null,
          // canSubmit true because there is no pending/verified submission
          canSubmit = true
        });
      }

      // canSubmit: allow submission only if previously rejected (user may re-submit)
      bool canSubmit = therapist.VerificationStatus == VerificationStatus.Rejected;

      return Ok(new
      {
        status = therapist.VerificationStatus.ToString(),
        submittedAt = therapist.SubmittedAt,
        verifiedAt = therapist.VerifiedAt,
        rejectionReason = therapist.RejectionReason,
        // return stored object path only (no public URL)
        licenseImagePath = therapist.LicenseImageUrl,
        canSubmit
      });
    }

    [HttpGet("patient/user-info")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> GetUserInfoForOnboarding()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var user = await _userManager.FindByIdAsync(userId);
      if (user is null) return NotFound("User not found");

      return Ok(new
      {
        firstName = user.FirstName,
        lastName = user.LastName,
        dateOfBirth = user.DateOfBirth,
        email = user.Email
      });
    }

    // Moved patient profiles list to PatientProfilesController at /api/patient/profiles

    [HttpGet("patient/status")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> GetPatientOnboardingStatus()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var guid = Guid.Parse(userId);

      var hasCompleted = await _context.Patients
          .AnyAsync(p => p.UserId == guid && p.IsOnboardingComplete);

      var selfPatient = await _context.Patients
          .FirstOrDefaultAsync(p => p.UserId == guid && p.RelationshipToUser == "Self");

      var patientsCount = await _context.Patients
          .CountAsync(p => p.UserId == guid && p.IsActive);

      return Ok(new
      {
        isPatientOnboardingComplete = hasCompleted,
        hasSelfProfile = selfPatient != null,
        selfPatientId = selfPatient?.Id,
        patientsCount
      });
    }

    [HttpPost("patient")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> CompletePatientOnboarding(PatientOnboardingDto onboardingDto)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId == null) return Unauthorized();

      var user = await _userManager.FindByIdAsync(userId);
      if (user == null) return NotFound("User not found");

      // Guard: If any patient profile for this account has already completed onboarding,
      // do not allow running the patient onboarding flow again.
      var alreadyCompleted = await _context.Patients
          .AnyAsync(p => p.UserId == Guid.Parse(userId) && p.IsOnboardingComplete);

      if (alreadyCompleted)
      {
        var profiles = await _context.Patients
            .Where(p => p.UserId == Guid.Parse(userId) && p.IsActive)
            .Select(p => new
            {
              id = p.Id,
              firstName = p.FirstName,
              lastName = p.LastName,
              relationshipToUser = p.RelationshipToUser,
              isOnboardingComplete = p.IsOnboardingComplete
            })
            .ToListAsync();

        return Conflict(new
        {
          message = "Patient onboarding already completed for this account. Add more profiles from the home screen.",
          profiles
        });
      }

      // Validate onboarding type
      if (onboardingDto.OnboardingType != "ForMyself" && onboardingDto.OnboardingType != "ForSomeoneElse")
      {
        return BadRequest("Invalid onboarding type. Must be 'ForMyself' or 'ForSomeoneElse'");
      }

      Patient? patient;
      bool isNewPatient = false;

      if (onboardingDto.OnboardingType == "ForMyself")
      {
        // Check if user already has a "Self" patient record
        patient = await _context.Patients
            .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId) && p.RelationshipToUser == "Self");

        if (patient == null)
        {
          // Create a new "Self" patient record if it doesn't exist
          patient = new Patient
          {
            UserId = Guid.Parse(userId),
            User = user,
            FirstName = user.FirstName,
            LastName = user.LastName,
            DateOfBirth = user.DateOfBirth,
            RelationshipToUser = "Self",
            Gender = string.IsNullOrWhiteSpace(onboardingDto.Gender)
                  ? null
                  : onboardingDto.Gender.Trim(),
            IsActive = true,
            IsOnboardingComplete = false
          };
          isNewPatient = true;
        }
        else
        {
          // Update existing self record
          patient.FirstName = user.FirstName;
          patient.LastName = user.LastName;
          patient.DateOfBirth = user.DateOfBirth;
          if (onboardingDto.Gender is not null)
          {
            patient.Gender = string.IsNullOrWhiteSpace(onboardingDto.Gender)
                ? null
                : onboardingDto.Gender.Trim();
          }
        }
      }
      else // ForSomeoneElse
      {
        // Validate required fields for "ForSomeoneElse"
        if (string.IsNullOrWhiteSpace(onboardingDto.FirstName) ||
            string.IsNullOrWhiteSpace(onboardingDto.LastName) ||
            onboardingDto.DateOfBirth == null ||
            string.IsNullOrWhiteSpace(onboardingDto.RelationshipToUser))
        {
          return BadRequest("FirstName, LastName, DateOfBirth, and RelationshipToUser are required for 'ForSomeoneElse' onboarding");
        }

        // Create new patient record for someone else
        patient = new Patient
        {
          UserId = Guid.Parse(userId),
          User = user,
          FirstName = onboardingDto.FirstName!.Trim(),
          LastName = onboardingDto.LastName!.Trim(),
          DateOfBirth = onboardingDto.DateOfBirth.Value,
          RelationshipToUser = onboardingDto.RelationshipToUser,
          Gender = string.IsNullOrWhiteSpace(onboardingDto.Gender)
                ? null
                : onboardingDto.Gender.Trim(),
          IsActive = true,
          IsOnboardingComplete = false
        };
        isNewPatient = true;
      }

      // Update common onboarding fields for both scenarios
      patient.Address = onboardingDto.Address;
      patient.Barangay = onboardingDto.Barangay;
      patient.Latitude = onboardingDto.Latitude;
      patient.Longitude = onboardingDto.Longitude;
      patient.ActivityLevel = onboardingDto.ActivityLevel;
      patient.CurrentComplaints = onboardingDto.CurrentComplaints;
      patient.Occupation = onboardingDto.Occupation;
      patient.IsOnboardingComplete = true;
      if (onboardingDto.Gender is not null)
      {
        patient.Gender = string.IsNullOrWhiteSpace(onboardingDto.Gender)
            ? null
            : onboardingDto.Gender.Trim();
      }

      // Add or update the patient record
      if (isNewPatient)
      {
        _context.Patients.Add(patient);
      }
      else
      {
        _context.Patients.Update(patient);
      }

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Patient onboarding completed successfully.",
        patientId = patient.Id,
        onboardingType = onboardingDto.OnboardingType,
        relationshipToUser = patient.RelationshipToUser
      });
    }

    [HttpGet("patient/check-self-profile")]
    [Authorize(Roles = "Patient")]
    public async Task<IActionResult> CheckSelfProfile()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId == null) return Unauthorized();

      var selfPatient = await _context.Patients
          .FirstOrDefaultAsync(p => p.UserId == Guid.Parse(userId) && p.RelationshipToUser == "Self");

      return Ok(new
      {
        hasSelfProfile = selfPatient != null,
        isSelfOnboardingComplete = selfPatient?.IsOnboardingComplete ?? false,
        selfPatientId = selfPatient?.Id
      });
    }

    [HttpPost("therapist")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> CompleteTherapistOnboarding([FromForm] TherapistOnboardingDto onboardingDto, IFormFile? profilePicture)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapist = await _context.PhysicalTherapists
          .Include(pt => pt.Specializations)
          .Include(pt => pt.ConditionsTreated)
          .Include(pt => pt.ServiceAreas)
          .Include(pt => pt.OtherConditions)
          .FirstOrDefaultAsync(pt => pt.UserId == Guid.Parse(userId));

      if (therapist is null)
      {
        return NotFound("Physical therapist not found.");
      }

      if (therapist.VerificationStatus != Entities.VerificationStatus.Verified)
      {
        return BadRequest("Cannot complete onboarding until verification is verified");
      }

      // Validate required fields for onboarding completion
      if (!onboardingDto.FeePerSession.HasValue || onboardingDto.FeePerSession.Value <= 0)
      {
        return BadRequest("Professional fee per session is required and must be greater than 0.");
      }

      if (onboardingDto.SpecializationIds == null || !onboardingDto.SpecializationIds.Any())
      {
        return BadRequest("At least one specialization is required.");
      }

      // If a profile picture file was uploaded, upload it to Supabase and set the object path.
      if (profilePicture != null)
      {
        string? uploadedProfilePath = null;
        try
        {
          uploadedProfilePath = await _storageService.UploadFileAsync(profilePicture, $"profiles/{userId}");
        }
        catch (Exception ex)
        {
          return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to upload profile picture", detail = ex.Message });
        }

        if (!string.IsNullOrEmpty(uploadedProfilePath))
        {
          // If there was an existing profile picture stored, attempt to delete it (best-effort).
          if (!string.IsNullOrEmpty(therapist.ProfilePictureUrl))
          {
            try
            {
              await _storageService.DeleteFileAsync(therapist.ProfilePictureUrl);
            }
            catch
            {
              // swallow; not critical
            }
          }

          therapist.ProfilePictureUrl = uploadedProfilePath;
        }
      }

      therapist.OtherConditionsTreated = onboardingDto.OtherConditions;
      // FeePerSession is now required, always set it
      therapist.FeePerSession = onboardingDto.FeePerSession.Value;
      if (onboardingDto.Gender is not null)
      {
        var normalizedGender = string.IsNullOrWhiteSpace(onboardingDto.Gender)
            ? null
            : onboardingDto.Gender.Trim();
        therapist.Gender = normalizedGender;
        therapist.User.Gender = normalizedGender; // Also sync to User.Gender
      }

      therapist.Specializations.Clear();
      therapist.ConditionsTreated.Clear();
      therapist.ServiceAreas.Clear();
      therapist.OtherConditions.Clear();

      if (onboardingDto.SpecializationIds.Any())
      {
        var specializations = await _context.Specializations
            .Where(s => onboardingDto.SpecializationIds.Contains(s.Id))
            .ToListAsync();

        foreach (var specialization in specializations)
        {
          therapist.Specializations.Add(specialization);
        }
      }

      if (onboardingDto.ConditionIds.Any())
      {
        var conditions = await _context.ConditionsTreated
            .Where(c => onboardingDto.ConditionIds.Contains(c.Id))
            .ToListAsync();

        foreach (var condition in conditions)
        {
          therapist.ConditionsTreated.Add(condition);
        }
      }

      if (onboardingDto.ServiceAreasIds.Any())
      {
        var serviceAreas = await _context.ServiceAreas
            .Where(sa => onboardingDto.ServiceAreasIds.Contains(sa.Id))
            .ToListAsync();

        foreach (var serviceArea in serviceAreas)
        {
          therapist.ServiceAreas.Add(serviceArea);
        }
      }

      // Handle user-submitted other conditions with curation
      if (onboardingDto.OtherConditionsList != null && onboardingDto.OtherConditionsList.Any())
      {
        foreach (var conditionName in onboardingDto.OtherConditionsList)
        {
          if (string.IsNullOrWhiteSpace(conditionName)) continue;

          var trimmedName = conditionName.Trim();

          // Case-insensitive search for existing condition
          var existingCondition = await _context.OtherConditions
              .FirstOrDefaultAsync(oc => oc.Name.ToLower() == trimmedName.ToLower());

          if (existingCondition != null)
          {
            // Use existing condition (whether Pending or Verified)
            therapist.OtherConditions.Add(existingCondition);
          }
          else
          {
            // Create new pending condition
            var newCondition = new Entities.OtherCondition
            {
              Name = trimmedName,
              Status = Entities.CurationStatus.Pending,
              CreatedAt = DateTime.UtcNow,
              UpdatedAt = DateTime.UtcNow
            };

            _context.OtherConditions.Add(newCondition);
            therapist.OtherConditions.Add(newCondition);
          }
        }
      }

      therapist.IsOnboardingComplete = true;

      _context.PhysicalTherapists.Update(therapist);
      await _context.SaveChangesAsync();

      return Ok(new { message = "Theraspist Onboarding completed successfully" });
    }

    [HttpGet("specializations")]
    public async Task<IActionResult> GetSpecializations()
    {
      var specializations = await _context.Specializations
          .Select(s => new { s.Id, s.Name })
          .ToListAsync();

      return Ok(specializations);
    }

    [HttpGet("conditions")]
    public async Task<IActionResult> GetConditions()
    {
      var grouped = await BuildConditionGroupsAsync();
      return Ok(grouped);
    }

    [HttpGet("conditions-grouped")]
    public async Task<IActionResult> GetConditionsGrouped([FromQuery] int[]? specializationIds = null)
    {
      _logger.LogInformation("{Message}", $"[GetConditionsGrouped] Received specializationIds: {(specializationIds != null ? string.Join(", ", specializationIds) : "null")}");
      var grouped = await BuildConditionGroupsAsync(specializationIds);
      _logger.LogInformation("{Message}", $"[GetConditionsGrouped] Returning {grouped.Count} groups");
      foreach (var group in grouped)
      {
        _logger.LogInformation("{Message}", $"  - {group.Label} ({group.Key})");
      }
      return Ok(grouped);
    }

    [HttpGet("service-areas")]
    public async Task<IActionResult> GetServiceAreas()
    {
      var serviceAreas = await _context.ServiceAreas
          .Select(sa => new { sa.Id, sa.Name })
          .ToListAsync();

      return Ok(serviceAreas);
    }

    private async Task<IReadOnlyCollection<ConditionGroupDto>> BuildConditionGroupsAsync(int[]? specializationIds = null)
    {
      var conditionSummaries = await _context.ConditionsTreated
          .Select(c => new { c.Id, c.Name, c.Category })
          .ToListAsync();

      var groupedByCategory = conditionSummaries
          .GroupBy(c => c.Category)
          .ToDictionary(
              g => g.Key,
              g => (IReadOnlyCollection<ConditionItemDto>)g
                  .OrderBy(x => x.Name)
                  .Select(x => new ConditionItemDto
                  {
                    Id = x.Id,
                    Name = x.Name
                  })
                  .ToList());

      var result = new List<ConditionGroupDto>();

      // Determine the category order based on selected specializations
      var orderedCategories = await GetOrderedCategoriesAsync(specializationIds);

      foreach (var (category, label) in orderedCategories)
      {
        groupedByCategory.TryGetValue(category, out var items);

        result.Add(new ConditionGroupDto
        {
          Key = category.ToString(),
          Label = label,
          Items = items ?? System.Array.Empty<ConditionItemDto>()
        });

        if (items is not null)
        {
          groupedByCategory.Remove(category);
        }
      }

      foreach (var remaining in groupedByCategory)
      {
        result.Add(new ConditionGroupDto
        {
          Key = remaining.Key.ToString(),
          Label = remaining.Key.ToDisplayLabel(),
          Items = remaining.Value
        });
      }

      return result;
    }

    private async Task<IReadOnlyList<(ConditionCategory Category, string Label)>> GetOrderedCategoriesAsync(int[]? specializationIds)
    {
      _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Input specializationIds: {(specializationIds != null ? string.Join(", ", specializationIds) : "null")}");

      // If no specializations are provided, use default order
      if (specializationIds == null || specializationIds.Length == 0)
      {
        _logger.LogInformation("{Message}", "[GetOrderedCategoriesAsync] No specializations provided, using default order");
        return ConditionCategoryExtensions.OrderedCategories;
      }

      // Fetch the specialization names
      var specializations = await _context.Specializations
          .Where(s => specializationIds.Contains(s.Id))
          .Select(s => new { s.Id, s.Name })
          .ToListAsync();

      _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Found {specializations.Count} specializations:");
      foreach (var spec in specializations)
      {
        _logger.LogInformation("{Message}", $"  - ID: {spec.Id}, Name: {spec.Name}");
      }

      // Create a mapping of specialization names to condition categories
      // This mapping determines which condition categories appear first based on selected specializations
      var specializationToCategoryMap = new Dictionary<string, ConditionCategory>(StringComparer.OrdinalIgnoreCase)
      {
        ["Orthopedic"] = ConditionCategory.Orthopedic,
        ["Orthopedic/Musculoskeletal"] = ConditionCategory.Orthopedic,
        ["Pediatric"] = ConditionCategory.Pediatric,
        ["Geriatric"] = ConditionCategory.Geriatric,
        ["Neurological"] = ConditionCategory.Neurological,
        ["Sports"] = ConditionCategory.Sports,
        ["Cardiopulmonary"] = ConditionCategory.Cardiopulmonary,
        ["Vestibular"] = ConditionCategory.Vestibular
      };

      // Build the ordered list based on selected specializations
      var orderedCategories = new List<(ConditionCategory Category, string Label)>();
      var seenCategories = new HashSet<ConditionCategory>();

      // Maintain the order of specializationIds by creating an index map
      var specializationOrder = specializations
          .Select((spec, index) => new { spec.Id, spec.Name, Order = Array.IndexOf(specializationIds, spec.Id) })
          .OrderBy(x => x.Order)
          .ToList();

      _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Specialization order after sorting:");
      foreach (var spec in specializationOrder)
      {
        _logger.LogInformation("{Message}", $"  - Order: {spec.Order}, ID: {spec.Id}, Name: {spec.Name}");
      }

      foreach (var spec in specializationOrder)
      {
        if (specializationToCategoryMap.TryGetValue(spec.Name, out var category))
        {
          if (!seenCategories.Contains(category))
          {
            _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Adding category: {category} ({category.ToDisplayLabel()}) for specialization: {spec.Name}");
            orderedCategories.Add((category, category.ToDisplayLabel()));
            seenCategories.Add(category);
          }
        }
      }

      // Add remaining categories that weren't selected
      foreach (var (category, label) in ConditionCategoryExtensions.OrderedCategories)
      {
        if (!seenCategories.Contains(category))
        {
          _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Adding remaining category: {category} ({label})");
          orderedCategories.Add((category, label));
        }
      }

      _logger.LogInformation("{Message}", $"[GetOrderedCategoriesAsync] Final order:");
      for (int i = 0; i < orderedCategories.Count; i++)
      {
        _logger.LogInformation("{Message}", $"  {i + 1}. {orderedCategories[i].Label}");
      }

      return orderedCategories;
    }
  }
}
