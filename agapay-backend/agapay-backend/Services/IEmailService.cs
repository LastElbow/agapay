using System.Threading;

namespace agapay_backend.Services
{
  public interface IEmailService
  {
    Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, string rawToken);
    Task SendOtpEmailAsync(string toEmail, string otpCode, string? subject = null, CancellationToken cancellationToken = default);
  }
}
