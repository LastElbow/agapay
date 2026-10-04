using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Services
{
  public class AvailabilityService : IAvailabilityService
  {
    private readonly agapayDbContext _context;
    private const int SlotMinutes = 30; // global slot size

    public AvailabilityService(agapayDbContext context)
    {
      _context = context;
    }

    public async Task<double> CalculateAvailabilityScore(int therapistId, int patientId)
    {
      var therapistAvailability = await _context.TherapistAvailabilities
          .Where(ta => ta.PhysicalTherapistId == therapistId && ta.IsAvailable)
          .ToListAsync();

      if (!therapistAvailability.Any())
        return 0.0;

      // NEW: Use PatientAvailability blocks instead of PatientPreferences
      var patientAvailabilities = await _context.PatientAvailabilities
          .Where(pa => pa.PatientId == patientId)
          .ToListAsync();

      // If patient has no availability blocks, fall back to legacy preferences
      if (!patientAvailabilities.Any())
      {
        return await CalculateAvailabilityScoreLegacy(therapistId, patientId, therapistAvailability);
      }

      // NEW FORMULA: Calculate using time slot sequences
      // Build patient's complete time slot set across all their availability blocks
      var patientSlots = new HashSet<(DayOfWeekEnum day, TimeOnly time)>();

      foreach (var block in patientAvailabilities)
      {
        foreach (var slot in EnumerateSlots(block.StartTime, block.EndTime, SlotMinutes))
        {
          patientSlots.Add((block.DayOfWeek, slot));
        }
      }

      if (patientSlots.Count == 0)
        return 0.0;

      // Build therapist's complete time slot set
      var therapistSlots = new HashSet<(DayOfWeekEnum day, TimeOnly time)>();
      foreach (var block in therapistAvailability)
      {
        foreach (var slot in EnumerateSlots(block.StartTime, block.EndTime, SlotMinutes))
        {
          therapistSlots.Add((block.DayOfWeek, slot));
        }
      }

      // Calculate overlap: Number of Matching Time Slots / Total Number of Preferred Time Slots
      int matchingSlots = patientSlots.Intersect(therapistSlots).Count();
      double score = (double)matchingSlots / patientSlots.Count;

      return Math.Clamp(score, 0.0, 1.0);
    }

    // Legacy method for backward compatibility with old PatientPreferences
    private async Task<double> CalculateAvailabilityScoreLegacy(
        int therapistId,
        int patientId,
        List<TherapistAvailability> therapistAvailability)
    {
      var patientPreferences = await _context.PatientPreferences
          .Include(pp => pp.PreferredDays)
          .FirstOrDefaultAsync(pp => pp.PatientId == patientId);

      // If patient has no preferences, return default score per paper-neutral policy
      if (patientPreferences == null ||
          patientPreferences.PreferredStartTime == null ||
          patientPreferences.PreferredEndTime == null)
      {
        return 0.5;
      }

      var start = patientPreferences.PreferredStartTime.Value;
      var end = patientPreferences.PreferredEndTime.Value;
      if (end <= start)
      {
        // invalid window yields 0 overlap
        return 0.0;
      }

      // Build the set of days to evaluate: multi-day if provided, else legacy single day
      var preferredDays = (patientPreferences.PreferredDays != null && patientPreferences.PreferredDays.Count > 0)
        ? patientPreferences.PreferredDays.Select(d => d.DayOfWeek).ToList()
        : new List<DayOfWeekEnum>();

      if (preferredDays.Count == 0)
      {
        return 0.5;
      }

      // Per paper: discretize time, count matching slots across all preferred days
      int totalPatientSlots = 0;
      int totalMatchingSlots = 0;

      foreach (var day in preferredDays)
      {
        var patientSlots = EnumerateSlots(start, end, SlotMinutes).ToList();
        totalPatientSlots += patientSlots.Count;

        if (patientSlots.Count == 0)
          continue;

        var therapistDayBlocks = therapistAvailability
            .Where(ta => ta.IsAvailable && ta.DayOfWeek == day)
            .ToList();

        if (therapistDayBlocks.Count == 0)
          continue;

        var therapistSlots = new HashSet<TimeOnly>();
        foreach (var block in therapistDayBlocks)
        {
          foreach (var s in EnumerateSlots(block.StartTime, block.EndTime, SlotMinutes))
          {
            therapistSlots.Add(s);
          }
        }

        foreach (var s in patientSlots)
        {
          if (therapistSlots.Contains(s)) totalMatchingSlots++;
        }
      }

      if (totalPatientSlots == 0)
        return 0.0;

      var score = (double)totalMatchingSlots / totalPatientSlots;
      return Math.Clamp(score, 0.0, 1.0);
    }

    public async Task<List<TherapistAvailability>> GetTherapistAvailability(int therapistId)
    {
      return await _context.TherapistAvailabilities
          .Where(ta => ta.PhysicalTherapistId == therapistId && ta.IsAvailable)
          .OrderBy(ta => ta.DayOfWeek)
          .ThenBy(ta => ta.StartTime)
          .ToListAsync();
    }

    public async Task UpdateTherapistAvailability(int therapistId, List<TherapistAvailabilityDto> availabilities)
    {
      var existingAvailability = await _context.TherapistAvailabilities
          .Where(ta => ta.PhysicalTherapistId == therapistId)
          .ToListAsync();

      if (availabilities == null || availabilities.Count == 0)
      {
        if (existingAvailability.Count == 0)
        {
          return;
        }

        _context.TherapistAvailabilities.RemoveRange(existingAvailability);
        await _context.SaveChangesAsync();
        return;
      }

      foreach (var availability in availabilities)
      {
        if (availability.EndTime <= availability.StartTime)
          throw new ArgumentException("Availability end time must be after the start time.");

        var identicalSlot = existingAvailability.FirstOrDefault(ta =>
            ta.DayOfWeek == availability.DayOfWeek &&
            ta.StartTime == availability.StartTime &&
            ta.EndTime == availability.EndTime &&
            (ta.SpecificDate == null && availability.SpecificDate == null ||
             ta.SpecificDate != null && availability.SpecificDate != null &&
             ta.SpecificDate.Value.Date == availability.SpecificDate.Value.Date));

        if (identicalSlot != null)
        {
          if (!availability.IsAvailable)
          {
            _context.TherapistAvailabilities.Remove(identicalSlot);
            existingAvailability.Remove(identicalSlot);
          }
          else
          {
            identicalSlot.IsAvailable = availability.IsAvailable;
            identicalSlot.SpecificDate = availability.SpecificDate.HasValue
              ? DateTime.SpecifyKind(availability.SpecificDate.Value.Date, DateTimeKind.Utc)
              : null;
            identicalSlot.Notes = availability.Notes;
          }

          continue;
        }

        if (!availability.IsAvailable)
        {
          // Request asked to disable a slot that does not exist; ignore gracefully.
          continue;
        }

        // Only check for overlaps within the same scope:
        // - Weekly recurring blocks (SpecificDate == null) only overlap with other weekly recurring blocks
        // - Specific date blocks only overlap with blocks on the exact same date
        var overlaps = existingAvailability.Any(ta =>
            ta.IsAvailable &&
            ta.DayOfWeek == availability.DayOfWeek &&
            (ta.SpecificDate == null && availability.SpecificDate == null ||
             ta.SpecificDate != null && availability.SpecificDate != null &&
             ta.SpecificDate.Value.Date == availability.SpecificDate.Value.Date) &&
            DoTimesOverlap(ta.StartTime, ta.EndTime, availability.StartTime, availability.EndTime));

        if (overlaps)
          throw new InvalidOperationException("New availability block overlaps with an existing block for the same day.");

        var newSlot = new TherapistAvailability
        {
          PhysicalTherapistId = therapistId,
          DayOfWeek = availability.DayOfWeek,
          StartTime = availability.StartTime,
          EndTime = availability.EndTime,
          IsAvailable = availability.IsAvailable,
          SpecificDate = availability.SpecificDate.HasValue
            ? DateTime.SpecifyKind(availability.SpecificDate.Value.Date, DateTimeKind.Utc)
            : null,
          Notes = availability.Notes
        };

        _context.TherapistAvailabilities.Add(newSlot);
        existingAvailability.Add(newSlot);
      }

      await _context.SaveChangesAsync();
    }

    public async Task<List<int>> GetAvailableTherapists(DayOfWeekEnum dayOfWeek, TimeOnly startTime, TimeOnly endTime)
    {
      return await _context.TherapistAvailabilities
          .Where(ta => ta.DayOfWeek == dayOfWeek &&
                     ta.IsAvailable &&
                     ta.StartTime <= startTime &&
                     ta.EndTime >= endTime)
          .Select(ta => ta.PhysicalTherapistId)
          .Distinct()
          .ToListAsync();
    }

    private static IEnumerable<TimeOnly> EnumerateSlots(TimeOnly start, TimeOnly end, int slotMinutes)
    {
      if (end <= start) yield break;
      var slot = TimeSpan.FromMinutes(slotMinutes);
      var current = start;
      while (current.Add(slot) <= end)
      {
        yield return current; // start inclusive
        current = current.Add(slot); // end exclusive
      }
    }

    private static bool DoTimesOverlap(TimeOnly start1, TimeOnly end1, TimeOnly start2, TimeOnly end2)
    {
      return start1 < end2 && start2 < end1;
    }
  }
}
