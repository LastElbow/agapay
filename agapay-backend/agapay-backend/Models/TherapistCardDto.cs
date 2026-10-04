using System;
using System.Collections.Generic;
using agapay_backend.Entities;

namespace agapay_backend.Models
{
  public class TherapistCardDto
  {
    public int Id { get; set; }
    public Guid UserId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }
    public string LicenseNumber { get; set; } = string.Empty; // Added
    public string? Gender { get; set; }

    public double? AverageRating { get; set; }
    public int RatingCount { get; set; }
    public decimal? FeePerSession { get; set; }

    public IEnumerable<string> Specializations { get; set; } = Array.Empty<string>();
    public IEnumerable<string> ServiceAreas { get; set; } = Array.Empty<string>();
    public bool IsOnboardingComplete { get; set; }
    public VerificationStatus VerificationStatus { get; set; }
  }
}
