using System.Text.Json.Serialization;

namespace agapay_backend.Models
{
  public record ErrorResponseDto
  {
    [JsonPropertyName("code")]
    public string Code { get; init; } = string.Empty;

    [JsonPropertyName("message")]
    public string Message { get; init; } = string.Empty;

    [JsonPropertyName("details")]
    public object? Details { get; init; }

    public static ErrorResponseDto Create(string code, string message, object? details = null) =>
      new()
      {
        Code = code,
        Message = message,
        Details = details
      };

    public static ErrorResponseDto InvalidCredentials() =>
      Create("InvalidCredentials", "Email or password is incorrect.");

    public static ErrorResponseDto RoleMismatch(string message) =>
      Create("RoleMismatch", message);

    public static ErrorResponseDto AccountNotVerified(string message, object? details = null) =>
      Create("AccountNotVerified", message, details);

    public static ErrorResponseDto MissingAccountEnrollment(string message) =>
      Create("EnrollmentRequired", message);
  }
}
