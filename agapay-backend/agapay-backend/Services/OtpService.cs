using System.Security.Cryptography;
using System.Threading;
using System.Text;
using agapay_backend.Common.Options;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace agapay_backend.Services
{
  public class OtpService : IOtpService
  {
    private readonly agapayDbContext _context;
    private readonly IEmailService _emailService;
    private readonly ILogger<OtpService> _logger;
    private readonly IConfiguration _config;
    private readonly OtpOptions _otp;
    private readonly TimeSpan _trustedDeviceTtl;

    public OtpService(
      agapayDbContext context,
      IEmailService emailService,
      ILogger<OtpService> logger,
      IConfiguration config,
      IOptions<OtpOptions> otpOptions)
    {
      _context = context;
      _emailService = emailService;
      _logger = logger;
      _config = config;
      _otp = otpOptions.Value;
      _trustedDeviceTtl = TimeSpan.FromDays(_otp.TrustedDeviceDays > 0 ? _otp.TrustedDeviceDays : 30);
    }

    public async Task<OtpChallengeResult> GenerateAndSendOtpAsync(string email, OtpPurpose purpose, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(email))
      {
        return new OtpChallengeResult(false, "Email is required.", null);
      }

      var normalizedEmail = email.Trim().ToUpperInvariant();
      var user = await _context.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
      if (user == null)
      {
        // Avoid leaking which emails exist. Treat as success but do nothing.
        _logger.LogWarning("OTP requested for non-existent email {Email}", email);
        return new OtpChallengeResult(true, "If the account exists, an OTP has been sent.", null);
      }

      // Check if this is a demo account that should bypass OTP
      var bypassOtp = ShouldBypassOtp(email);

      // OTP codes are short-lived; Frontend uses ExpiresAtUtc for the resend timer.
      // Set a fixed 60-second lifetime so the resend button is gated to 60s.
      var now = DateTime.UtcNow;
      var expiration = now.AddSeconds(_otp.LifetimeSeconds);

      // Expire any previous active OTPs for this purpose
      var existingCodes = await _context.OtpCodes
        .Where(o => o.UserId == user.Id && o.Purpose == purpose && o.UsedAt == null && o.ExpirationTime > now)
        .ToListAsync(cancellationToken);

      foreach (var otp in existingCodes)
      {
        otp.ExpirationTime = now;
      }

      // For demo accounts, use a fixed code; otherwise generate random
      var code = bypassOtp ? "123456" : GenerateOtpCode();
      var hashed = HashOtp(code, user.Id, purpose);

      var entity = new OtpCode
      {
        UserId = user.Id,
        CodeHash = hashed,
        Purpose = purpose,
        CreatedAt = now,
        ExpirationTime = expiration
      };

      await _context.OtpCodes.AddAsync(entity, cancellationToken);
      await _context.SaveChangesAsync(cancellationToken);

      if (bypassOtp)
      {
        _logger.LogInformation("[DEMO ACCOUNT] OTP bypass enabled for {Email}. Code: {Code}", email, code);
      }
      else
      {
        await _emailService.SendOtpEmailAsync(user.Email!, code, BuildSubject(purpose), cancellationToken);
      }

      return new OtpChallengeResult(true, "OTP has been sent.", expiration);
    }

    public async Task<bool> IsDeviceTrustedAsync(Guid userId, string? deviceId, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(deviceId))
      {
        return false;
      }

      var normalized = deviceId.Trim();
      var device = await _context.TrustedDevices.FirstOrDefaultAsync(
        td => td.UserId == userId && td.DeviceId == normalized,
        cancellationToken);

      if (device == null)
      {
        return false;
      }

      var now = DateTime.UtcNow;

      if (device.IsRevoked || device.ExpiresAt <= now)
      {
        if (!device.IsRevoked && device.ExpiresAt <= now)
        {
          device.IsRevoked = true;
          device.LastSeenAt = now;
          await _context.SaveChangesAsync(cancellationToken);
        }
        return false;
      }

      device.LastSeenAt = now;
      await _context.SaveChangesAsync(cancellationToken);
      return true;
    }

    public async Task RegisterTrustedDeviceAsync(Guid userId, string deviceId, string? deviceName, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(deviceId))
      {
        return;
      }

      var normalized = deviceId.Trim();
      var now = DateTime.UtcNow;
      var expires = now.Add(_trustedDeviceTtl);

      var existing = await _context.TrustedDevices.FirstOrDefaultAsync(
        td => td.UserId == userId && td.DeviceId == normalized,
        cancellationToken);

      if (existing == null)
      {
        var entity = new TrustedDevice
        {
          UserId = userId,
          DeviceId = normalized,
          DeviceName = string.IsNullOrWhiteSpace(deviceName) ? null : deviceName.Trim(),
          CreatedAt = now,
          LastSeenAt = now,
          ExpiresAt = expires,
          IsRevoked = false
        };
        await _context.TrustedDevices.AddAsync(entity, cancellationToken);
      }
      else
      {
        if (!string.IsNullOrWhiteSpace(deviceName))
        {
          existing.DeviceName = deviceName.Trim();
        }
        existing.LastSeenAt = now;
        existing.ExpiresAt = expires;
        existing.IsRevoked = false;
      }

      await _context.SaveChangesAsync(cancellationToken);
    }

    public async Task<OtpVerificationResult> VerifyOtpAsync(string email, string otpCode, OtpPurpose purpose, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(otpCode))
      {
        return new OtpVerificationResult(false, "Invalid email or code.", null);
      }

      var normalizedEmail = email.Trim().ToUpperInvariant();
      var user = await _context.Users.FirstOrDefaultAsync(u => u.NormalizedEmail == normalizedEmail, cancellationToken);
      if (user == null)
      {
        // Avoid leaking existence but indicate failure
        _logger.LogWarning("OTP verification requested for non-existent email {Email}", email);
        return new OtpVerificationResult(false, "Invalid email or code.", null);
      }

      var now = DateTime.UtcNow;
      var candidates = await _context.OtpCodes
        .Where(o => o.UserId == user.Id && o.Purpose == purpose && o.UsedAt == null && o.ExpirationTime >= now)
        .OrderByDescending(o => o.CreatedAt)
        .ToListAsync(cancellationToken);

      if (candidates.Count == 0)
      {
        return new OtpVerificationResult(false, "The code has expired. Please request a new one.", user.Id);
      }

      var hashed = HashOtp(otpCode.Trim(), user.Id, purpose);
      var match = candidates.FirstOrDefault(o => o.CodeHash == hashed);
      if (match == null)
      {
        return new OtpVerificationResult(false, "Invalid verification code.", user.Id);
      }

      match.UsedAt = now;
      await _context.SaveChangesAsync(cancellationToken);

      return new OtpVerificationResult(true, null, user.Id);
    }

    private static string GenerateOtpCode()
    {
      var buffer = RandomNumberGenerator.GetBytes(4);
      var value = BitConverter.ToUInt32(buffer, 0) % 1_000_000;
      return value.ToString("D6");
    }

    private static string HashOtp(string code, Guid userId, OtpPurpose purpose)
    {
      using var sha = SHA256.Create();
      var bytes = Encoding.UTF8.GetBytes($"{code}:{userId}:{purpose}");
      return Convert.ToHexString(sha.ComputeHash(bytes));
    }

    private static string BuildSubject(OtpPurpose purpose) => purpose switch
    {
      OtpPurpose.AccountVerification => "Verify your Agapay account",
      OtpPurpose.TwoFactorLogin => "Your Agapay login code",
      OtpPurpose.PasswordReset => "Your Agapay reset code",
      _ => "Your Agapay verification code"
    };

    /// <summary>
    /// Checks if the email belongs to a demo account (ends with @demo.agapay.com).
    /// </summary>
    private static bool IsDemoAccountEmail(string email)
    {
      return !string.IsNullOrWhiteSpace(email) &&
             email.EndsWith("@demo.agapay.com", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Determines if OTP should be bypassed for this email based on configuration.
    /// Requires both the seed demo-account flag and the Otp:DemoFixedCodeEnabled gate
    /// (which can disable the fixed-code backdoor without touching the seed flag).
    /// </summary>
    private bool ShouldBypassOtp(string email)
    {
      var bypass = _config.GetValue<bool>("Seed:BypassOtpForDemoAccounts");
      return _otp.DemoFixedCodeEnabled && bypass && IsDemoAccountEmail(email);
    }
  }
}
