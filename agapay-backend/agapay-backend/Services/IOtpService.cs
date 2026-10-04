using System;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Entities;

namespace agapay_backend.Services
{
  public record OtpChallengeResult(bool Success, string Message, DateTime? ExpiresAtUtc);

  public record OtpVerificationResult(bool Success, string? Message, Guid? UserId);

  public interface IOtpService
  {
    Task<OtpChallengeResult> GenerateAndSendOtpAsync(string email, OtpPurpose purpose, CancellationToken cancellationToken = default);

    Task<OtpVerificationResult> VerifyOtpAsync(string email, string otpCode, OtpPurpose purpose, CancellationToken cancellationToken = default);

    Task<bool> IsDeviceTrustedAsync(Guid userId, string? deviceId, CancellationToken cancellationToken = default);

    Task RegisterTrustedDeviceAsync(Guid userId, string deviceId, string? deviceName, CancellationToken cancellationToken = default);
  }
}
