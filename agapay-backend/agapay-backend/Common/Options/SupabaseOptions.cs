namespace agapay_backend.Common.Options
{
  /// <summary>
  /// Bound from the "Supabase" configuration section.
  /// </summary>
  public class SupabaseOptions
  {
    public const string SectionName = "Supabase";

    public string Url { get; set; } = string.Empty;
    public string ServiceRoleKey { get; set; } = string.Empty;
    public string Bucket { get; set; } = string.Empty;
  }
}
