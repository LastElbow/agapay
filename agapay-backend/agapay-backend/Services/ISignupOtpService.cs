using agapay_backend.Entities;

namespace agapay_backend.Services
{
  public record SignupOtpChallengeResult(bool Success, string? Message, DateTime? ExpiresAtUtc);
  public record SignupOtpVerificationResult(bool Success, string? Message);

  public interface ISignupOtpService
  {
    Task<SignupOtpChallengeResult> GenerateAndSendOtpAsync(
      string email,
      OtpPurpose purpose,
      CancellationToken cancellationToken = default);

    Task<SignupOtpVerificationResult> VerifyOtpAsync(
      string email,
      string otpCode,
      OtpPurpose purpose,
      CancellationToken cancellationToken = default);
  }
}
