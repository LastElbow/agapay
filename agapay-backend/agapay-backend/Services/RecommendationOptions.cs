namespace agapay_backend.Services
{
  public class RecommendationOptions
  {
    // Must be >= 0. If they don't sum to 1 we'll normalize at runtime.
    // Adjusted weights after removing experience: distributed 0.17 among remaining factors
    public double WeightAvailability { get; set; } = 0.25;
    public double WeightRating { get; set; } = 0.20;
    public double WeightBudget { get; set; } = 0.20;
    public double WeightSpecialization { get; set; } = 0.20;
    public double WeightDesiredService { get; set; } = 0.15;

    // Deprecated: This will be eventually thrown out
    public double WeightServiceArea { get; set; } = 0.10;

    public int DefaultTop { get; set; } = 10;
    public int ExperienceBaselinePercent { get; set; } = 20; // optional helper, not required by code

    /// <summary>
    /// Threshold for "Recommended" tier (score >= this value).
    /// Default is 0.70 (70%).
    /// </summary>
    public double RecommendedThreshold { get; set; } = 0.70;

    /// <summary>
    /// Minimum score (0.0 to 1.0) required for a therapist to be included in results.
    /// Lowered to 0.05 to allow "Other Options" to appear in the toggle list.
    /// </summary>
    public double MinMatchScore { get; set; } = 0.05;
  }
}
