using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services;
using agapay_backend.Hubs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using agapay_backend.Models;
using agapay_backend.Models.Requests;
using System.Linq;
using agapay_backend.Services.Profiles;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class TherapistController : ControllerBase
  {
    private readonly agapayDbContext _context;
    private readonly ISupabaseStorageService _storageService;
    private readonly IHubContext<ColleaguesHub> _colleaguesHub;
    private readonly IProfilePhotoService _profilePhotoService;

    public TherapistController(agapayDbContext context, ISupabaseStorageService storageService, IHubContext<ColleaguesHub> colleaguesHub, IProfilePhotoService profilePhotoService)
    {
      _context = context;
      _storageService = storageService;
      _colleaguesHub = colleaguesHub;
      _profilePhotoService = profilePhotoService;
    }

    // Returns a paginated list of therapists.
    [HttpGet]
    [Authorize]
    public async Task<IActionResult> ListTherapists(
      [FromQuery] int page = 1,
      [FromQuery] int limit = 10,
      [FromQuery] string? status = null,
      [FromQuery] string? search = null)
    {
      IQueryable<PhysicalTherapist> therapistQuery = _context.PhysicalTherapists
          .AsNoTracking()
          .Include(t => t.User)
          .Include(t => t.Specializations)
          .Include(t => t.ServiceAreas);

      var normalizedStatus = status?.Trim().ToLowerInvariant();

      // Filter by verification status
      if (!string.IsNullOrEmpty(normalizedStatus))
      {
        therapistQuery = normalizedStatus switch
        {
          "verified" => therapistQuery.Where(t => t.IsOnboardingComplete && t.VerificationStatus == VerificationStatus.Verified),
          "pending" => therapistQuery.Where(t => t.VerificationStatus == VerificationStatus.Pending),
          "rejected" => therapistQuery.Where(t => t.VerificationStatus == VerificationStatus.Rejected),
          "onboarding" or "incomplete" => therapistQuery.Where(t => !t.IsOnboardingComplete),
          _ => therapistQuery
        };
      }
      else
      {
         // Default to verified only for public listing if no specific status requested
         therapistQuery = therapistQuery.Where(t => t.IsOnboardingComplete && t.VerificationStatus == VerificationStatus.Verified);
      }

      // Optional text search (Name or License)
      if (!string.IsNullOrWhiteSpace(search))
      {
          var s = search.Trim().ToLower();
          therapistQuery = therapistQuery.Where(t => 
              (t.User.FirstName + " " + t.User.LastName).ToLower().Contains(s) || 
              t.LicenseNumber.ToLower().Contains(s));
      }

      // Count total items before paging
      var totalItems = await therapistQuery.CountAsync();

      // Apply ordering
      // Order by first name, then last name
      therapistQuery = therapistQuery.OrderBy(t => t.User.FirstName).ThenBy(t => t.User.LastName);

      // Apply pagination
      var skip = (page - 1) * limit;
      var rawList = await therapistQuery
          .Skip(skip)
          .Take(limit)
          .Select(t => new
          {
            Id = t.Id,
            UserId = t.UserId,
            FirstName = t.User != null ? t.User.FirstName : null,
            LastName = t.User != null ? t.User.LastName : null,
            LicenseNumber = t.LicenseNumber,
            Gender = t.Gender,
            ProfilePictureUrl = t.ProfilePictureUrl,
            AverageRating = t.AverageRating,
            RatingCount = t.RatingCount,
            FeePerSession = t.FeePerSession,
            Specializations = t.Specializations.Select(s => s.Name).OrderBy(name => name).ToList(),
            ServiceAreas = t.ServiceAreas.Select(sa => sa.Name).OrderBy(name => name).ToList(),
            IsOnboardingComplete = t.IsOnboardingComplete,
            VerificationStatus = t.VerificationStatus
          })
          .ToListAsync();

      // Format names and URLs in-memory
      var list = new List<TherapistCardDto>();
      foreach(var t in rawList)
      {
          var item = new TherapistCardDto
          {
            Id = t.Id,
            UserId = t.UserId,
            Name = !string.IsNullOrWhiteSpace(t.FirstName) || !string.IsNullOrWhiteSpace(t.LastName)
                ? NameUtils.FullName(t.FirstName, t.LastName)
                : t.LicenseNumber,
            LicenseNumber = t.LicenseNumber,
            Gender = t.Gender,
            ProfilePictureUrl = t.ProfilePictureUrl,
            AverageRating = t.AverageRating,
            RatingCount = t.RatingCount,
            FeePerSession = t.FeePerSession,
            Specializations = t.Specializations,
            ServiceAreas = t.ServiceAreas,
            IsOnboardingComplete = t.IsOnboardingComplete,
            VerificationStatus = t.VerificationStatus
          };

          if (!string.IsNullOrWhiteSpace(item.ProfilePictureUrl))
          {
            try
            {
              item.ProfilePictureUrl = await _storageService.ResolveUrlAsync(item.ProfilePictureUrl!, 3600);
            }
            catch {}
          }
          list.Add(item);
      }

      return Ok(new PaginatedResult<TherapistCardDto>
      {
          Items = list,
          TotalCount = totalItems,
          Page = page,
          PageSize = limit,
          TotalPages = (int)Math.Ceiling(totalItems / (double)limit)
      });
    }

    // Returns the authenticated therapist's editable profile with selected IDs
    [HttpGet("me/details")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> GetMyEditableDetails()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var t = await _context.PhysicalTherapists
          .Include(x => x.User)
          .Include(x => x.Specializations)
          .Include(x => x.ConditionsTreated)
          .Include(x => x.ServiceAreas)
          .FirstOrDefaultAsync(x => x.UserId == Guid.Parse(userId));

      if (t is null || t.User is null) return NotFound("Physical therapist not found");

      var dto = new TherapistEditableProfileDto
      {
        TherapistId = t.Id,
        UserId = t.UserId,
        FirstName = t.User.FirstName,
        LastName = t.User.LastName,
        DateOfBirth = t.User.DateOfBirth,
        Gender = t.Gender ?? t.User.Gender,
        FeePerSession = t.FeePerSession,
        OtherConditions = t.OtherConditionsTreated,
        SpecializationIds = t.Specializations.Select(s => s.Id).ToArray(),
        ConditionIds = t.ConditionsTreated.Select(c => c.Id).ToArray(),
        ServiceAreaIds = t.ServiceAreas.Select(sa => sa.Id).ToArray(),
        // Add full objects for frontend display
        Specializations = t.Specializations.OrderBy(s => s.Name).Select(s => new SpecializationDto { Id = s.Id, Name = s.Name }).ToArray(),
        Conditions = t.ConditionsTreated.OrderBy(c => c.Name).Select(c => new ConditionDto { Id = c.Id, Name = c.Name }).ToArray(),
        ServiceAreas = t.ServiceAreas.OrderBy(sa => sa.Name).Select(sa => new { Id = sa.Id, Name = sa.Name }).ToArray()
      };

      return Ok(dto);
    }

    // Update authenticated therapist profile
    [HttpPut("me")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> UpdateMyProfile([FromBody] UpdateTherapistProfileDto dto)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var t = await _context.PhysicalTherapists
          .Include(x => x.User)
          .Include(x => x.Specializations)
          .Include(x => x.ConditionsTreated)
          .Include(x => x.ServiceAreas)
          .FirstOrDefaultAsync(x => x.UserId == Guid.Parse(userId));

      if (t is null || t.User is null) return NotFound("Physical therapist not found");

      // Update user fields if provided
      if (!string.IsNullOrWhiteSpace(dto.FirstName)) t.User.FirstName = dto.FirstName.Trim();
      if (!string.IsNullOrWhiteSpace(dto.LastName)) t.User.LastName = dto.LastName.Trim();
      if (dto.DateOfBirth.HasValue) t.User.DateOfBirth = dto.DateOfBirth.Value;

      // Update therapist scalar fields
      if (!string.IsNullOrWhiteSpace(dto.Gender))
      {
        var normalizedGender = dto.Gender.Trim();
        t.Gender = normalizedGender;
        t.User.Gender = normalizedGender; // Also update User.Gender for consistency
      }
      if (dto.FeePerSession.HasValue) t.FeePerSession = dto.FeePerSession.Value;
      if (dto.OtherConditions != null) t.OtherConditionsTreated = string.IsNullOrWhiteSpace(dto.OtherConditions) ? null : dto.OtherConditions.Trim();

      // Replace many-to-many selections when provided
      if (dto.SpecializationIds is not null)
      {
        t.Specializations.Clear();
        if (dto.SpecializationIds.Count > 0)
        {
          var specs = await _context.Specializations
              .Where(s => dto.SpecializationIds.Contains(s.Id))
              .ToListAsync();
          foreach (var s in specs) t.Specializations.Add(s);
        }
      }

      if (dto.ConditionIds is not null)
      {
        t.ConditionsTreated.Clear();
        if (dto.ConditionIds.Count > 0)
        {
          var conds = await _context.ConditionsTreated
              .Where(c => dto.ConditionIds.Contains(c.Id))
              .ToListAsync();
          foreach (var c in conds) t.ConditionsTreated.Add(c);
        }
      }

      if (dto.ServiceAreasIds is not null)
      {
        t.ServiceAreas.Clear();
        if (dto.ServiceAreasIds.Count > 0)
        {
          var areas = await _context.ServiceAreas
              .Where(sa => dto.ServiceAreasIds.Contains(sa.Id))
              .ToListAsync();
          foreach (var a in areas) t.ServiceAreas.Add(a);
        }
      }

      await _context.SaveChangesAsync();
      return Ok(new { message = "Profile updated" });
    }

    // Returns full therapist details by id (for detail page)
    [HttpGet("{therapistId:int}")]
    [Authorize]
    public async Task<IActionResult> GetTherapistDetails(int therapistId)
    {
      var t = await _context.PhysicalTherapists
          .AsNoTracking()
          .Include(x => x.User)
          .Include(x => x.Specializations)
          .Include(x => x.ConditionsTreated)
          .Include(x => x.ServiceAreas)
          .FirstOrDefaultAsync(x => x.Id == therapistId && x.IsOnboardingComplete && x.VerificationStatus == VerificationStatus.Verified);

      if (t is null) return NotFound("Therapist not found");

      var dto = new TherapistDetailDto
      {
        Id = t.Id,
        UserId = t.UserId,
        Name = t.User != null ? NameUtils.FullName(t.User.FirstName, t.User.LastName) : t.LicenseNumber,
        LicenseNumber = t.LicenseNumber,
        ProfilePictureUrl = t.ProfilePictureUrl, // will convert below
        WorkPhoneNumber = t.WorkPhoneNumber,
        AverageRating = t.AverageRating,
        RatingCount = t.RatingCount,
        Gender = t.Gender,
        FeePerSession = t.FeePerSession,
        Specializations = t.Specializations.Select(s => s.Name).OrderBy(name => name).ToList(),
        ConditionsTreated = t.ConditionsTreated.Select(c => c.Name).OrderBy(name => name).ToList(),
        ServiceAreas = t.ServiceAreas.Select(sa => sa.Name).OrderBy(name => name).ToList()
      };

      if (!string.IsNullOrWhiteSpace(dto.ProfilePictureUrl))
      {
        dto.ProfilePictureUrl = await _storageService.ResolveUrlAsync(dto.ProfilePictureUrl!, 3600);
      }

      return Ok(dto);
    }

    // Returns the authenticated therapist's own profile (basic details + status)
    [HttpGet("me")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> GetMyTherapistProfile()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var t = await _context.PhysicalTherapists
          .Include(x => x.User)
          .AsNoTracking()
          .FirstOrDefaultAsync(x => x.UserId == Guid.Parse(userId));

      if (t is null) return NotFound("Physical therapist not found");

      string? profileUrl = null;
      if (!string.IsNullOrWhiteSpace(t.ProfilePictureUrl))
      {
        profileUrl = await _storageService.ResolveUrlAsync(t.ProfilePictureUrl!, 3600);
      }

      return Ok(new
      {
        Id = t.Id,
        UserId = t.UserId,
        name = t.User != null ? NameUtils.FullName(t.User.FirstName, t.User.LastName) : t.LicenseNumber,
        licenseNumber = t.LicenseNumber,
        profilePictureUrl = profileUrl,
        averageRating = t.AverageRating,
        ratingCount = t.RatingCount,
        feePerSession = t.FeePerSession,
        gender = t.Gender ?? t.User?.Gender, // Fallback to User.Gender
        isOnboardingComplete = t.IsOnboardingComplete,
        verificationStatus = t.VerificationStatus.ToString()
      });
    }

    // Returns the current authenticated therapist's usable profile picture URL (signed or public)
    [HttpGet("me/photo")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> GetMyProfilePhoto()
    {
      var therapist = await User.GetForCallerAsync(_context);

      if (therapist is null) return NotFound("Physical therapist not found");

      if (string.IsNullOrWhiteSpace(therapist.ProfilePictureUrl))
        return Ok(new { profilePicture = (string?)null });

      var url = await _storageService.ResolveUrlAsync(therapist.ProfilePictureUrl, 3600);
      return Ok(new { profilePicture = url });
    }

    // Allows the authenticated therapist to set or update their fee
    [HttpPut("me/fee")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> UpdateMyFee(UpdateFeeDto dto)
    {
      var therapist = await User.GetForCallerAsync(_context);

      if (therapist is null) return NotFound("Physical therapist not found");

      therapist.FeePerSession = dto.FeePerSession;
      await _context.SaveChangesAsync();
      return Ok(new { message = "Fee updated" });
    }

    // POST /api/therapist/profile-picture - Upload profile picture for the logged-in therapist
    [HttpPost("profile-picture")]
    [Authorize(Roles = "PhysicalTherapist")]
    [RequestSizeLimit(10_000_000)] // 10MB limit
    public async Task<IActionResult> UploadProfilePicture([FromForm] IFormFile profilePicture)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();
      var guid = Guid.Parse(userId);

      var therapist = await User.GetForCallerAsync(_context);
      if (therapist is null) return NotFound("Physical therapist not found");

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
        var uploaded = await _profilePhotoService.UploadAsync(profilePicture, $"therapist-profiles/{guid}", therapist.ProfilePictureUrl);
        therapist.ProfilePictureUrl = uploaded.UploadedPath;

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

    // Returns another therapist's usable profile picture URL by therapist id (used by home/profiles list)
    [HttpGet("{therapistId:int}/photo")]
    [Authorize] // allow any authenticated user; change or open as needed
    public async Task<IActionResult> GetTherapistPhoto(int therapistId)
    {
      var therapist = await _context.PhysicalTherapists
          .AsNoTracking()
          .FirstOrDefaultAsync(pt => pt.Id == therapistId);

      if (therapist is null) return NotFound("Therapist not found");

      if (string.IsNullOrWhiteSpace(therapist.ProfilePictureUrl))
        return Ok(new { profilePicture = (string?)null });

      var url = await _storageService.ResolveUrlAsync(therapist.ProfilePictureUrl, 3600);
      return Ok(new { profilePicture = url });
    }

    // Lookup therapist by underlying user id (for patient chat/session detail context)
    [HttpGet("by-user/{userGuid:guid}")]
    [Authorize]
    public async Task<IActionResult> GetTherapistByUserId(Guid userGuid)
    {
      var t = await _context.PhysicalTherapists
          .AsNoTracking()
          .Include(x => x.User)
          .FirstOrDefaultAsync(x => x.UserId == userGuid && x.IsOnboardingComplete && x.VerificationStatus == VerificationStatus.Verified);

      if (t is null) return NotFound("Therapist not found");

      return Ok(new
      {
        id = t.Id,
        userId = t.UserId,
        name = t.User != null ? NameUtils.FullName(t.User.FirstName, t.User.LastName) : t.LicenseNumber,
        licenseNumber = t.LicenseNumber
      });
    }

    // ========== COLLEAGUE NETWORK MANAGEMENT ==========

    // GET /api/Therapist/me/colleagues - Get my trusted colleagues
    [HttpGet("me/colleagues")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> GetMyColleagues()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapist = await _context.PhysicalTherapists
          .Include(t => t.TrustedColleagues)
          .ThenInclude(tc => tc.Colleague)
          .ThenInclude(c => c.User)
          .Include(t => t.TrustedColleagues)
          .ThenInclude(tc => tc.Colleague.Specializations)
          .AsNoTracking()
          .FirstOrDefaultAsync(t => t.UserId == Guid.Parse(userId));

      if (therapist is null) return NotFound("Therapist not found");

      var colleagues = therapist.TrustedColleagues
          .Where(tc => tc.Status == ColleagueStatus.Accepted)
          .Select(tc => new
          {
            id = tc.ColleagueId,
            name = NameUtils.FullName(tc.Colleague.User.FirstName, tc.Colleague.User.LastName),
            specializations = tc.Colleague.Specializations.Select(s => s.Name).OrderBy(n => n).ToList(),
            averageRating = tc.Colleague.AverageRating,
            ratingCount = tc.Colleague.RatingCount,
            addedAt = tc.AddedAt,
            notes = tc.Notes
          })
          .OrderBy(c => c.name)
          .ToList();

      return Ok(colleagues);
    }

    // POST /api/Therapist/me/colleagues/{colleagueId} - Add a colleague to my network
    [HttpPost("me/colleagues/{colleagueId:int}")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> AddColleague(int colleagueId, [FromBody] AddColleagueRequest? body)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapist = await User.GetForCallerAsync(_context);

      if (therapist is null) return NotFound("Therapist not found");
      if (therapist.Id == colleagueId) return BadRequest("Cannot add yourself as a colleague");

      // Verify colleague exists and is verified
      var colleague = await _context.PhysicalTherapists
          .FirstOrDefaultAsync(t => t.Id == colleagueId && 
                                     t.VerificationStatus == VerificationStatus.Verified && 
                                     t.IsOnboardingComplete);

      if (colleague is null) return NotFound("Colleague not found or not verified");

      // Check if already in network
      var exists = await _context.TherapistColleagues
          .AnyAsync(tc => tc.TherapistId == therapist.Id && tc.ColleagueId == colleagueId);

      if (exists) return BadRequest("Colleague already in your network");

      // Add to network as Pending
      var newColleague = new TherapistColleague
      {
        TherapistId = therapist.Id,
        ColleagueId = colleagueId,
        AddedAt = DateTime.UtcNow,
        Notes = body?.Notes,
        Status = ColleagueStatus.Pending
      };

      _context.TherapistColleagues.Add(newColleague);
      await _context.SaveChangesAsync();

      // Get sender's and receiver's userId for SignalR notification
      var receiverUserId = await _context.PhysicalTherapists
          .Where(t => t.Id == colleagueId)
          .Select(t => t.UserId.ToString())
          .FirstOrDefaultAsync();

      // Broadcast to both users so sender sees it in outgoing and receiver sees it in incoming
      if (!string.IsNullOrEmpty(receiverUserId))
      {
        await _colleaguesHub.Clients.Users(new[] { userId, receiverUserId })
            .SendAsync("ColleagueRequestUpdated", new { type = "sent", senderId = therapist.Id, receiverId = colleagueId });
      }

      return Ok(new { message = "Colleague request sent successfully" });
    }

    // DELETE /api/Therapist/me/colleagues/{colleagueId} - Remove a colleague from my network
    [HttpDelete("me/colleagues/{colleagueId:int}")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> RemoveColleague(int colleagueId)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapist = await User.GetForCallerAsync(_context);

      if (therapist is null) return NotFound("Therapist not found");

      var colleague = await _context.TherapistColleagues
          .FirstOrDefaultAsync(tc => tc.TherapistId == therapist.Id && tc.ColleagueId == colleagueId);

      if (colleague is null) return NotFound("Colleague not found in your network");

      // Remove the relationship from my side
      _context.TherapistColleagues.Remove(colleague);

      // Also remove the reciprocal relationship so it's removed from both networks
      var reciprocal = await _context.TherapistColleagues
          .FirstOrDefaultAsync(tc => tc.TherapistId == colleagueId && tc.ColleagueId == therapist.Id);

      if (reciprocal != null)
      {
        _context.TherapistColleagues.Remove(reciprocal);
      }

      await _context.SaveChangesAsync();

      // Get colleague's userId for SignalR notification
      var colleagueUserId = await _context.PhysicalTherapists
          .Where(t => t.Id == colleagueId)
          .Select(t => t.UserId.ToString())
          .FirstOrDefaultAsync();

      // Broadcast to both users so both see the removal in real-time
      if (!string.IsNullOrEmpty(colleagueUserId))
      {
        await _colleaguesHub.Clients.Users(new[] { userId, colleagueUserId })
            .SendAsync("ColleagueRequestUpdated", new { type = "removed", removerId = therapist.Id, removedId = colleagueId });
      }

      return Ok(new { message = "Colleague removed successfully" });
    }

    // GET /api/Therapist/me/colleague-requests - Get Incoming and Outgoing requests
    [HttpGet("me/colleague-requests")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> GetColleagueRequests()
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var therapistId = await _context.PhysicalTherapists
          .Where(t => t.UserId == Guid.Parse(userId))
          .Select(t => t.Id)
          .FirstOrDefaultAsync();

      if (therapistId == 0) return NotFound("Therapist not found");

      // Incoming: Status=Pending AND ColleagueId == Me
      // Fetch raw data first to avoid v._ord issue
      var incomingRaw = await _context.TherapistColleagues
          .Include(tc => tc.Therapist) // The sender
            .ThenInclude(t => t.User)
          .Include(tc => tc.Therapist.Specializations) // Add missing Include
          .Where(tc => tc.ColleagueId == therapistId && tc.Status == ColleagueStatus.Pending)
          .AsNoTracking()
          .ToListAsync();

      var incoming = incomingRaw.Select(tc => new
      {
          id = tc.TherapistId, // The sender's ID
          name = NameUtils.FullName(tc.Therapist.User.FirstName, tc.Therapist.User.LastName),
          specializations = tc.Therapist.Specializations.Select(s => s.Name).OrderBy(n => n).ToList(),
          requestedAt = tc.AddedAt,
          notes = tc.Notes
      }).ToList();

      // Outgoing: Status=Pending AND TherapistId == Me
      var outgoingRaw = await _context.TherapistColleagues
          .Include(tc => tc.Colleague) // The receiver
            .ThenInclude(c => c.User)
          .Where(tc => tc.TherapistId == therapistId && tc.Status == ColleagueStatus.Pending)
          .AsNoTracking()
          .ToListAsync();

      var outgoing = outgoingRaw.Select(tc => new
      {
          id = tc.ColleagueId, // The receiver's ID
          name = NameUtils.FullName(tc.Colleague.User.FirstName, tc.Colleague.User.LastName),
          requestedAt = tc.AddedAt
      }).ToList();

      return Ok(new { incoming, outgoing });
    }

    // POST /api/Therapist/me/colleague-requests/{senderId}/accept - Accept a request
    // senderId is the ID of the therapist who SENT the request (so I am ColleagueId)
    [HttpPost("me/colleague-requests/{senderId:int}/accept")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> AcceptColleagueRequest(int senderId)
    {
      var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (userId is null) return Unauthorized();

      var myId = await _context.PhysicalTherapists
          .Where(t => t.UserId == Guid.Parse(userId))
          .Select(t => t.Id)
          .FirstOrDefaultAsync();

      if (myId == 0) return NotFound("Therapist not found");

      var request = await _context.TherapistColleagues
          .FirstOrDefaultAsync(tc => tc.TherapistId == senderId && tc.ColleagueId == myId && tc.Status == ColleagueStatus.Pending);

      if (request is null) return NotFound("Request not found");

      // Accept the original request
      request.Status = ColleagueStatus.Accepted;

      // Create reciprocal relationship so both therapists see each other in their networks
      // Check if reciprocal relationship already exists
      var reciprocalExists = await _context.TherapistColleagues
          .AnyAsync(tc => tc.TherapistId == myId && tc.ColleagueId == senderId);

      if (!reciprocalExists)
      {
        var reciprocalRelationship = new TherapistColleague
        {
          TherapistId = myId,
          ColleagueId = senderId,
          AddedAt = DateTime.UtcNow,
          Status = ColleagueStatus.Accepted,
          Notes = null
        };
        _context.TherapistColleagues.Add(reciprocalRelationship);
      }

      await _context.SaveChangesAsync();

      // Get sender's userId for SignalR notification
      var senderUserId = await _context.PhysicalTherapists
          .Where(t => t.Id == senderId)
          .Select(t => t.UserId.ToString())
          .FirstOrDefaultAsync();

      // Broadcast to both users
      if (!string.IsNullOrEmpty(senderUserId))
      {
        await _colleaguesHub.Clients.Users(new[] { userId, senderUserId })
            .SendAsync("ColleagueRequestUpdated", new { type = "accepted", senderId, receiverId = myId });
      }

      return Ok(new { message = "Request accepted" });
    }

    // DELETE /api/Therapist/me/colleague-requests/{senderId}/decline - Decline a request
    [HttpDelete("me/colleague-requests/{senderId:int}/decline")]
    [Authorize(Roles = "PhysicalTherapist")]
    public async Task<IActionResult> DeclineColleagueRequest(int senderId)
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (userId is null) return Unauthorized();

        var myId = await _context.PhysicalTherapists
            .Where(t => t.UserId == Guid.Parse(userId))
            .Select(t => t.Id)
            .FirstOrDefaultAsync();

        if (myId == 0) return NotFound("Therapist not found");

        var request = await _context.TherapistColleagues
            .FirstOrDefaultAsync(tc => tc.TherapistId == senderId && tc.ColleagueId == myId && tc.Status == ColleagueStatus.Pending);

        if (request is null) return NotFound("Request not found");

        _context.TherapistColleagues.Remove(request);
        await _context.SaveChangesAsync();

        // Get sender's userId for SignalR notification
        var senderUserId = await _context.PhysicalTherapists
            .Where(t => t.Id == senderId)
            .Select(t => t.UserId.ToString())
            .FirstOrDefaultAsync();

        // Broadcast to both users
        if (!string.IsNullOrEmpty(senderUserId))
        {
            await _colleaguesHub.Clients.Users(new[] { userId, senderUserId })
                .SendAsync("ColleagueRequestUpdated", new { type = "declined", senderId, receiverId = myId });
        }

        return Ok(new { message = "Request declined" });
    }
  }
}

