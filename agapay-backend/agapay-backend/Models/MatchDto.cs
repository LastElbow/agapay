namespace agapay_backend.Models
{
  public class MatchDto
  {
    public int TherapistId { get; set; }
    public string TherapistName { get; set; } = string.Empty;
    public string? ProfilePictureUrl { get; set; }

    // Final weighted score [0..1]
    public double MatchScore { get; set; }

    // Match tier classification (Excellent, Good, Partial)
    public MatchTier Tier { get; set; }

    // Human-readable tier label for display
    public string TierLabel => Tier switch
    {
      MatchTier.Recommended => "Recommended",
      MatchTier.OtherOption => "Other Option",
      _ => "Match"
    };

    // Breakdown for explainability
    public Dictionary<string, double> Breakdown { get; set; } = new();

    // Helpful details for UI
    public double? AverageRating { get; set; }
    public int RatingCount { get; set; }
    public decimal? FeePerSession { get; set; }
    public IEnumerable<string> Specializations { get; set; } = Array.Empty<string>();
    public IEnumerable<string> ServiceAreas { get; set; } = Array.Empty<string>();
    public string? Gender { get; set; }
  }
}
