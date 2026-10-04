namespace agapay_backend.Common
{
  /// <summary>
  /// Shared UTC normalization for incoming DateTime values that are stored in or
  /// compared against "timestamp with time zone" columns (previously duplicated
  /// inline in SessionsController endpoints).
  /// </summary>
  public static class DateTimeUtils
  {
    /// <summary>An Unspecified value is assumed to already be UTC (stamped as Utc
    /// without shifting, to avoid double-shifting client payloads); any other kind
    /// is converted with ToUniversalTime().</summary>
    public static DateTime NormalizeToUtc(DateTime value)
    {
      if (value.Kind == DateTimeKind.Unspecified)
      {
        return DateTime.SpecifyKind(value, DateTimeKind.Utc);
      }

      return value.ToUniversalTime();
    }
  }
}
