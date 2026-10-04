namespace agapay_backend.Common.Options
{
  /// <summary>
  /// Bound from the "Jwt" configuration section. Replaces inline
  /// configuration["Jwt:..."] reads scattered across services/controllers.
  /// </summary>
  public class JwtOptions
  {
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public string Key { get; set; } = string.Empty;
    public double AccessTokenExpirationMinutes { get; set; } = 15;
    public double RefreshTokenExpirationDays { get; set; } = 7;
  }
}
