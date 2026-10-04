namespace agapay_backend.Common.Options
{
  /// <summary>
  /// Bound from the "Otp" configuration section.
  /// LifetimeSeconds defaults to 60 so the frontend resend timer stays gated to 60s
  /// (the previous hardcoded value); ExpiryMinutes is what the email copy advertises.
  /// </summary>
  public class OtpOptions
  {
    public const string SectionName = "Otp";

    public int ExpiryMinutes { get; set; } = 10;
    public int LifetimeSeconds { get; set; } = 60;
    public int TrustedDeviceDays { get; set; } = 30;
    public bool LogToConsoleInDev { get; set; } = false;

    /// <summary>
    /// Phase 2 security gate: when false, demo accounts no longer receive the fixed
    /// OTP code. Default true preserves the historical demo behavior.
    /// </summary>
    public bool DemoFixedCodeEnabled { get; set; } = true;
  }
}
