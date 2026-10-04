using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace agapay_backend.Services
{
  public class EmailService : IEmailService
  {
    private readonly IConfiguration _config;
    private readonly ILogger<EmailService> _logger;
    private readonly IHostEnvironment _environment;
    private readonly IHttpClientFactory _httpClientFactory;

    public EmailService(
      IConfiguration config,
      ILogger<EmailService> logger,
      IHostEnvironment environment,
      IHttpClientFactory httpClientFactory)
    {
      _config = config;
      _logger = logger;
      _environment = environment;
      _httpClientFactory = httpClientFactory;
    }

    public async Task SendPasswordResetEmailAsync(string toEmail, string resetUrl, string rawToken)
    {
      // In production you'd use a provider (SendGrid, SES, etc.). This is a simple SMTP fallback.
      var smtpHost = _config["Smtp:Host"];
      var smtpUser = _config["Smtp:User"];
      var smtpPass = _config["Smtp:Pass"];
      var smtpPort = int.TryParse(_config["Smtp:Port"], out var p) ? p : 587;
      var fromEmail = _config["Smtp:From"] ?? "no-reply@agapay.local";

      var subject = "Agapay Password Reset";
      var body = $@"<p>You requested a password reset.</p>
<p>Click the link below (or copy/paste into your browser) to reset your password:</p>
<p><a href='{resetUrl}'>{resetUrl}</a></p>
<p>If you did not request this, you can ignore this email.</p>";

      // If no SMTP config, log the details so dev can copy
      if (string.IsNullOrWhiteSpace(smtpHost))
      {
        _logger.LogInformation("[DEV EMAIL] To: {to}\nSubject: {sub}\nResetUrl: {url}\nToken: {tok}", toEmail, subject, resetUrl, rawToken);
        return;
      }

      using var client = new SmtpClient(smtpHost, smtpPort)
      {
        EnableSsl = true,
        Credentials = new NetworkCredential(smtpUser, smtpPass)
      };

      var msg = new MailMessage(fromEmail, toEmail, subject, body)
      {
        IsBodyHtml = true
      };
      try
      {
        await client.SendMailAsync(msg);
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Failed sending password reset email to {to}", toEmail);
        // Don't leak details to caller; log internally
      }
    }

    public async Task SendOtpEmailAsync(string toEmail, string otpCode, string? subject = null, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrWhiteSpace(toEmail))
      {
        throw new ArgumentException("Recipient email is required", nameof(toEmail));
      }

      subject ??= "Your Agapay verification code";

      // Always attempt to send a real email, regardless of environment.
      // The fallback to logging will still occur if Mailjet configuration is missing.

      var senderEmail = _config["Mailjet:SenderEmail"] ?? _config["Smtp:From"];
      var senderName = _config["Mailjet:SenderName"] ?? "Agapay";
      var apiKey = _config["Mailjet:ApiKey"];
      var apiSecret = _config["Mailjet:ApiSecret"];
      var expiryMinutes = _config.GetValue<int?>("Otp:ExpiryMinutes") ?? 10;

      if (string.IsNullOrWhiteSpace(senderEmail) || string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(apiSecret))
      {
        _logger.LogWarning("Mailjet configuration missing. Logging OTP for {Email}.", toEmail);
        _logger.LogInformation("[OTP FALLBACK] To: {Email} Code: {Code}", toEmail, otpCode);
        return;
      }

      try
      {
        var payload = new
        {
          Messages = new[]
          {
            new
            {
              From = new { Email = senderEmail, Name = senderName },
              To = new[] { new { Email = toEmail } },
              Subject = subject,
              TextPart = $"Your verification code is {otpCode}. It expires in {expiryMinutes} minutes.",
              HTMLPart = $"<p>Your verification code is <strong>{otpCode}</strong>.</p><p>This code expires in {expiryMinutes} minutes. If you did not request it, please contact support.</p>"
            }
          }
        };

        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.mailjet.com/v3.1/send")
        {
          Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };

        var credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{apiKey}:{apiSecret}"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", credentials);

        var client = _httpClientFactory.CreateClient("mailjet");
        using var response = await client.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
          var body = await response.Content.ReadAsStringAsync(cancellationToken);
          _logger.LogError("Failed to send OTP email via Mailjet for {Email}. Status: {Status} - {Body}", toEmail, response.StatusCode, body);
          _logger.LogInformation("[OTP FALLBACK] To: {Email} Code: {Code}", toEmail, otpCode);
        }
      }
      catch (Exception ex)
      {
        _logger.LogError(ex, "Exception sending OTP email to {Email}", toEmail);
        _logger.LogInformation("[OTP FALLBACK] To: {Email} Code: {Code}", toEmail, otpCode);
      }
    }
  }
}
