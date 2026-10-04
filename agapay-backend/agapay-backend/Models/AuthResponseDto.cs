namespace agapay_backend.Models
{
  public class AuthResponseDto
  {
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public UserDto? User { get; set; }
    // Suggested client redirect path (computed from selected or preferred role)
    public string? HomePath { get; set; }
  }
}
