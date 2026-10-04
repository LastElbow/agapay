using System;
using System.Collections.Generic;

namespace agapay_backend.Models
{
  public class UpdateTherapistProfileDto
  {
    // User-level fields (optional)
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public DateOnly? DateOfBirth { get; set; }

    // Therapist-level fields (all optional for partial updates)
    public string? Gender { get; set; }
    public decimal? FeePerSession { get; set; }
    public string? OtherConditions { get; set; }

    public List<int>? SpecializationIds { get; set; }
    public List<int>? ConditionIds { get; set; }
    public List<int>? ServiceAreasIds { get; set; }
  }
}

