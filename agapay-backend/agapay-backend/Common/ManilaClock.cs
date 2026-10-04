namespace agapay_backend.Common
{
  /// <summary>
  /// Single source of truth for the Philippine timezone used by session scheduling,
  /// auto-transition and contract date-parsing code (previously hardcoded as the
  /// literal "Asia/Manila" in three files). The fallback chain preserves the exact
  /// resolution behavior the old per-file helpers had.
  /// </summary>
  public static class ManilaClock
  {
    public static readonly TimeZoneInfo Zone = ResolveZone();

    private static TimeZoneInfo ResolveZone()
    {
      try
      {
        return TimeZoneInfo.FindSystemTimeZoneById("Asia/Manila");
      }
      catch (TimeZoneNotFoundException)
      {
        return TimeZoneInfo.FindSystemTimeZoneById("Singapore Standard Time");
      }
      catch (InvalidTimeZoneException)
      {
        return TimeZoneInfo.Local;
      }
    }

    /// <summary>The current wall-clock time in Manila.</summary>
    public static DateTime Now => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, Zone);

    public static DateTime ConvertFromUtc(DateTime utc) => TimeZoneInfo.ConvertTimeFromUtc(utc, Zone);

    public static DateTime ConvertToUtc(DateTime manilaTime) => TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(manilaTime, DateTimeKind.Unspecified), Zone);

    /// <summary>Today's date in Manila.</summary>
    public static DateTime Today => Now.Date;
  }
}
