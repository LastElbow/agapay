using System.Security.Cryptography;
using System.Text;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Services
{
  public class SignupOtpService : ISignupOtpService
  {
    private readonly agapayDbContext _context;
    private readonly IEmailService _emailService;
    private readonly ILogger<SignupOtpService> _logger;
    private readonly IConfiguration _config;

    public SignupOtpService(
      agapayDbContext context,
      IEmailService emailService,
      ILogger<SignupOtpService> logger,
      IConfiguration config)
    {
      _context = context;
      _emailService = emailService;
      _logger = logger;
      _config = config;
    }

    public async Task<SignupOtpChallengeResult> GenerateAndSendOtpAsync(
      string email,
      OtpPurpose purpose,
      CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(email))
      {
        return new SignupOtpChallengeResult(false, "Email is required.", null);
      }

      var normalizedEmail = email.Trim().ToUpperInvariant();

      var bypassOtp = ShouldBypassOtp(email);
      var now = DateTime.UtcNow;
      var expiration = now.AddSeconds(60);

      var existingCodes = await _context.SignupOtpCodes
        .Where(o => o.NormalizedEmail == normalizedEmail && o.Purpose == purpose && o.UsedAt == null && o.ExpirationTime > now)
        .ToListAsync(cancellationToken);

      foreach (var otp in existingCodes)
      {
        otp.ExpirationTime = now;
      }

      var code = bypassOtp ? "123456" : GenerateOtpCode();
      var hashed = HashOtp(code, normalizedEmail, purpose);

      var entity = new SignupOtpCode
      {
        NormalizedEmail = normalizedEmail,
        CodeHash = hashed,
        Purpose = purpose,
        CreatedAt = now,
        ExpirationTime = expiration
      };

      await _context.SignupOtpCodes.AddAsync(entity, cancellationToken);
      await _context.SaveChangesAsync(cancellationToken);

      if (bypassOtp)
      {
        _logger.LogInformation("[DEMO ACCOUNT] Signup OTP bypass enabled for {Email}. Code: {Code}", email, code);
      }
      else
      {
        await _emailService.SendOtpEmailAsync(email.Trim(), code, BuildSubject(purpose), cancellationToken);
      }

      return new SignupOtpChallengeResult(true, "OTP has been sent.", expiration);
    }

    public async Task<SignupOtpVerificationResult> VerifyOtpAsync(
      string email,
      string otpCode,
      OtpPurpose purpose,
      CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(otpCode))
      {
        return new SignupOtpVerificationResult(false, "Invalid email or code.");
      }

      var normalizedEmail = email.Trim().ToUpperInvariant();
      var now = DateTime.UtcNow;

      var candidates = await _context.SignupOtpCodes
        .Where(o => o.NormalizedEmail == normalizedEmail && o.Purpose == purpose && o.UsedAt == null && o.ExpirationTime >= now)
        .OrderByDescending(o => o.CreatedAt)
        .ToListAsync(cancellationToken);

      if (candidates.Count == 0)
      {
        return new SignupOtpVerificationResult(false, "The code has expired. Please request a new one.");
      }

      var hashed = HashOtp(otpCode.Trim(), normalizedEmail, purpose);
      var match = candidates.FirstOrDefault(o => o.CodeHash == hashed);
      if (match == null)
      {
        return new SignupOtpVerificationResult(false, "Invalid verification code.");
      }

      match.UsedAt = now;
      await _context.SaveChangesAsync(cancellationToken);

      return new SignupOtpVerificationResult(true, null);
    }

    private static string GenerateOtpCode()
    {
      var buffer = RandomNumberGenerator.GetBytes(4);
      var value = BitConverter.ToUInt32(buffer, 0) % 1_000_000;
      return value.ToString("D6");
    }

    private static string HashOtp(string code, string normalizedEmail, OtpPurpose purpose)
    {
      using var sha = SHA256.Create();
      var bytes = Encoding.UTF8.GetBytes($"{code}:{normalizedEmail}:{purpose}");
      return Convert.ToHexString(sha.ComputeHash(bytes));
    }

    private static string BuildSubject(OtpPurpose purpose) => purpose switch
    {
      OtpPurpose.AccountVerification => "Verify your Agapay account",
      OtpPurpose.TwoFactorLogin => "Your Agapay login code",
      OtpPurpose.PasswordReset => "Your Agapay reset code",
      _ => "Your Agapay verification code"
    };

    private static bool IsDemoAccountEmail(string email)
    {
      return !string.IsNullOrWhiteSpace(email) &&
             email.EndsWith("@demo.agapay.com", StringComparison.OrdinalIgnoreCase);
    }

    private bool ShouldBypassOtp(string email)
    {
      var bypass = _config.GetValue<bool>("Seed:BypassOtpForDemoAccounts");
      return bypass && IsDemoAccountEmail(email);
    }
  }
}
