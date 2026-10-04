using agapay_backend.Common;
using agapay_backend.Data;
using agapay_backend.Models;
using agapay_backend.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace agapay_backend.Services
{
  public class RecommendationService : IRecommendationService
  {
    private readonly agapayDbContext _db;
    private readonly IAvailabilityService _availability;
    private readonly IRatingService _rating;
    private readonly IBudgetNormalizationService _budget;
    private readonly RecommendationOptions _options;

    private const bool TherapistGenderPropertyAvailable = true;

    public RecommendationService(
        agapayDbContext db,
        IAvailabilityService availability,
        IRatingService rating,
        IBudgetNormalizationService budget,
        IOptions<RecommendationOptions> options)
    {
      _db = db;
      _availability = availability;
      _rating = rating;
      _budget = budget;
      _options = options.Value;
    }

    public async Task<List<MatchDto>> GetRecommendationsAsync(
        int patientId,
        int top = 5,
        PatientPreferencesDto? patientPreferences = null,
        CancellationToken ct = default)
    {
      // Load patient + preferences + availability blocks for fallback context
      var patient = await _db.Patients
          .AsNoTracking()
          .Include(p => p.Preferences)
          .ThenInclude(pp => pp!.PreferredDays)
          .Include(p => p.Availabilities)
          .FirstOrDefaultAsync(p => p.Id == patientId, ct);

      if (patient is null) return new List<MatchDto>();

      var effectivePreferences = patientPreferences ?? (patient.Preferences is null
          ? null
          : new PatientPreferencesDto
          {
            // Include new Availabilities
            Availabilities = patient.Availabilities?.Select(a => new PatientAvailabilityDto
            {
              DayOfWeek = a.DayOfWeek,
              StartTime = a.StartTime,
              EndTime = a.EndTime
            }).ToList(),

            // Legacy fields for backward compatibility
            PreferredDaysOfWeek = patient.Preferences.PreferredDays?.Select(d => d.DayOfWeek).ToList(),
            PreferredStartTime = patient.Preferences.PreferredStartTime,
            PreferredEndTime = patient.Preferences.PreferredEndTime,
            SessionBudget = patient.Preferences.SessionBudget,
            PreferredSpecialization = patient.Preferences.PreferredSpecialization,
            DesiredService = patient.Preferences.DesiredService,
            PreferredBarangay = patient.Preferences.PreferredBarangay,
            PreferredTherapistGender = patient.Preferences.PreferredTherapistGender
          });

      if (!HasMeaningfulPreferences(effectivePreferences))
      {
        return new List<MatchDto>();
      }

      var effectiveBudget = effectivePreferences?.SessionBudget;

      // Build weight vector and normalize
      var w = new Dictionary<string, double>
      {
        ["availability"] = _options.WeightAvailability,
        ["rating"] = _options.WeightRating,
        ["budget"] = _options.WeightBudget,
        ["specialization"] = _options.WeightSpecialization,
        ["desiredService"] = _options.WeightDesiredService
      };
      var totalW = w.Values.Sum();
      if (totalW <= 0) totalW = 1.0;
      var normalizedW = w.ToDictionary(kv => kv.Key, kv => kv.Value / totalW);

      // Pre-filter therapists: verified & onboarding complete (tunable)
      var genderPreference = NormalizeGenderPreference(effectivePreferences?.PreferredTherapistGender);
      var barangayPreference = NormalizeBarangayPreference(effectivePreferences?.PreferredBarangay, patient.Barangay);

      var candidatesQuery = _db.PhysicalTherapists
          .AsNoTracking()
          .Where(t => t.IsOnboardingComplete && t.VerificationStatus == VerificationStatus.Verified)
          .Include(t => t.User)
          .Include(t => t.Specializations)
          .Include(t => t.ConditionsTreated)
          .Include(t => t.ServiceAreas);

      var candidates = await candidatesQuery.ToListAsync(ct);
      var filteredCandidates = ApplyPreferenceFilters(candidates, genderPreference, barangayPreference);

      if (filteredCandidates.Count == 0)
      {
        return new List<MatchDto>();
      }

      var results = new List<MatchDto>(filteredCandidates.Count);

      foreach (var t in filteredCandidates)
      {
        // Availability
        double availabilityScore = 0.0;
        try
        {
          // IAvailabilityService.CalculateAvailabilityScore returns [0..1]
          availabilityScore = await _availability.CalculateAvailabilityScore(t.Id, patientId);
        }
        catch
        {
          availabilityScore = 0.0;
        }

        // Rating (use rating service Bayesian normalized score)
        double ratingScore = 0.0;
        try
        {
          var ratingResult = await _rating.ComputeNormalizedRatingAsync(t.Id);
          ratingScore = ratingResult.normalizedScore;
        }
        catch
        {
          ratingScore = 0.0;
        }

        // Budget
        double budgetScore = _budget.ComputeBudgetScore(t.FeePerSession, effectiveBudget);

        // Specialization matching: strictly binary
        double specializationScore = 0.0; // default to 0 if no preference provided
        var specPref = effectivePreferences?.PreferredSpecialization;
        if (!string.IsNullOrWhiteSpace(specPref))
        {
          specializationScore = t.Specializations.Any(s => string.Equals(s.Name, specPref, StringComparison.OrdinalIgnoreCase)) ? 1.0 : 0.0;
        }

        // Service area: prefer barangay preference, then stored patient location
        double desiredServiceScore = 0.0;
        var desiredService = effectivePreferences?.DesiredService;
        if (!string.IsNullOrWhiteSpace(desiredService))
        {
          // Support multiple services (comma-separated)
          var desiredServicesList = desiredService.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
          int matchCount = 0;

          foreach (var service in desiredServicesList)
          {
            bool matchesConditionList = t.ConditionsTreated.Any(c =>
              !string.IsNullOrWhiteSpace(c.Name) &&
              (c.Name.Contains(service, StringComparison.OrdinalIgnoreCase) ||
               service.Contains(c.Name, StringComparison.OrdinalIgnoreCase)));

            bool matchesOther = !string.IsNullOrWhiteSpace(t.OtherConditionsTreated) &&
              (t.OtherConditionsTreated.Contains(service, StringComparison.OrdinalIgnoreCase) ||
               service.Contains(t.OtherConditionsTreated, StringComparison.OrdinalIgnoreCase));

            if (matchesConditionList || matchesOther)
            {
              matchCount++;
            }
          }

          // Score based on how many of the desired services match
          desiredServiceScore = desiredServicesList.Length > 0
            ? (double)matchCount / desiredServicesList.Length
            : 0.0;
        }

        // Weighted sum
        var breakdown = new Dictionary<string, double>
        {
          ["availability"] = availabilityScore,
          ["rating"] = ratingScore,
          ["budget"] = budgetScore,
          ["specialization"] = specializationScore,
          ["desiredService"] = desiredServiceScore
        };

        double score = 0.0;
        foreach (var kv in breakdown)
        {
          score += normalizedW[kv.Key] * kv.Value;
        }

        results.Add(new MatchDto
        {
          TherapistId = t.Id,
          TherapistName = t.User != null ? NameUtils.FullName(t.User.FirstName, t.User.LastName) : t.LicenseNumber,
          ProfilePictureUrl = t.ProfilePictureUrl,
          MatchScore = Math.Clamp(score, 0.0, 1.0),
          Tier = DetermineMatchTier(score),
          Breakdown = breakdown,
          AverageRating = t.AverageRating,
          RatingCount = t.RatingCount,
          FeePerSession = t.FeePerSession,
          Specializations = t.Specializations.Select(s => s.Name).ToList(),
          ServiceAreas = t.ServiceAreas.Select(sa => sa.Name).ToList(),
          Gender = t.Gender
        });
      }

      // Return top-N across all tiers, ordered by score then rating
      return results
          .Where(r => r.MatchScore >= _options.MinMatchScore)
          .OrderByDescending(r => r.MatchScore)
          .ThenByDescending(r => r.Breakdown["rating"])
          .Take(Math.Max(1, top))
          .ToList();
    }

    private MatchTier DetermineMatchTier(double score)
    {
      if (score >= _options.RecommendedThreshold)
        return MatchTier.Recommended;
      return MatchTier.OtherOption;
    }

    private static bool HasMeaningfulPreferences(PatientPreferencesDto? preferences)
    {
      if (preferences is null) return false;

      // New availability blocks
      bool hasAvailabilities = preferences.Availabilities is { Count: > 0 };

      // Legacy schedule fields
      bool hasSchedule = preferences.PreferredStartTime.HasValue && preferences.PreferredEndTime.HasValue;
      bool hasDays = preferences.PreferredDaysOfWeek is { Count: > 0 };

      // Other preference filters
      bool hasBudget = preferences.SessionBudget.HasValue && preferences.SessionBudget.Value > 0m;
      bool hasSpecialization = !string.IsNullOrWhiteSpace(preferences.PreferredSpecialization);
      bool hasDesiredService = !string.IsNullOrWhiteSpace(preferences.DesiredService);
      bool hasBarangay = !string.IsNullOrWhiteSpace(preferences.PreferredBarangay);
      bool hasTherapistGender = !string.IsNullOrWhiteSpace(preferences.PreferredTherapistGender);

      return hasAvailabilities || hasSchedule || hasDays || hasBudget || hasSpecialization || hasDesiredService || hasBarangay || hasTherapistGender;
    }

    private static List<PhysicalTherapist> ApplyPreferenceFilters(
        List<PhysicalTherapist> candidates,
        string? genderPreference,
        string? barangayPreference)
    {
      IEnumerable<PhysicalTherapist> filtered = candidates;

      if (!string.IsNullOrWhiteSpace(barangayPreference))
      {
        filtered = filtered.Where(t => MatchesBarangayPreference(t, barangayPreference!));
      }

      if (!string.IsNullOrWhiteSpace(genderPreference) && TherapistGenderPropertyAvailable)
      {
        filtered = filtered.Where(t => MatchesGenderPreference(t, genderPreference!));
      }

      return filtered.ToList();
    }

    private static bool MatchesBarangayPreference(PhysicalTherapist therapist, string barangayPreference)
    {
      if (therapist.ServiceAreas is null || therapist.ServiceAreas.Count == 0)
      {
        return false;
      }

      foreach (var area in therapist.ServiceAreas)
      {
        if (area is null || string.IsNullOrWhiteSpace(area.Name)) continue;

        if (string.Equals(area.Name.Trim(), barangayPreference, StringComparison.OrdinalIgnoreCase))
        {
          return true;
        }
      }

      return false;
    }

    private static bool MatchesGenderPreference(PhysicalTherapist therapist, string genderPreference)
    {
      if (therapist is null) return false;

      var therapistGender = therapist.Gender;
      if (string.IsNullOrWhiteSpace(therapistGender))
      {
        return false;
      }

      return string.Equals(therapistGender.Trim(), genderPreference, StringComparison.OrdinalIgnoreCase);
    }

    private static string? NormalizeGenderPreference(string? rawGender)
    {
      if (string.IsNullOrWhiteSpace(rawGender)) return null;

      var trimmed = rawGender.Trim();
      return string.Equals(trimmed, "Any", StringComparison.OrdinalIgnoreCase) ? null : trimmed;
    }

    private static string? NormalizeBarangayPreference(string? preferredBarangay, string? patientBarangay)
    {
      var candidate = !string.IsNullOrWhiteSpace(preferredBarangay)
          ? preferredBarangay
          : patientBarangay;

      return string.IsNullOrWhiteSpace(candidate) ? null : candidate.Trim();
    }

  }
}
