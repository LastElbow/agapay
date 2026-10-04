namespace agapay_backend.Models
{
  /// <summary>
  /// Represents the quality tier of a therapist match based on score thresholds.
  /// </summary>
  public enum MatchTier
  {
    /// <summary>
    /// Recommended match: score >= 70%
    /// </summary>
    Recommended,

    /// <summary>
    /// Other options: score < 70%
    /// </summary>
    OtherOption
  }
}
