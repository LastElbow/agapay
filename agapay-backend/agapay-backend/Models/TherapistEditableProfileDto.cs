using System;
using System.Collections.Generic;

namespace agapay_backend.Models
{
  public class SpecializationDto
  {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
  }

  public class ConditionDto
  {
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int? SpecializationId { get; set; }
  }

  public class TherapistEditableProfileDto
  {
    public int TherapistId { get; set; }
    public Guid UserId { get; set; }

    // User-level
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public DateOnly DateOfBirth { get; set; }

    // Therapist-level
    public string? Gender { get; set; }
    public decimal? FeePerSession { get; set; }
    public string? OtherConditions { get; set; }

    public IReadOnlyCollection<int> SpecializationIds { get; set; } = Array.Empty<int>();
    public IReadOnlyCollection<int> ConditionIds { get; set; } = Array.Empty<int>();
    public IReadOnlyCollection<int> ServiceAreaIds { get; set; } = Array.Empty<int>();
    
    // Full objects for frontend display
    public IReadOnlyCollection<SpecializationDto>? Specializations { get; set; }
    public IReadOnlyCollection<ConditionDto>? Conditions { get; set; }
    public IReadOnlyCollection<object>? ServiceAreas { get; set; }
  }
}

