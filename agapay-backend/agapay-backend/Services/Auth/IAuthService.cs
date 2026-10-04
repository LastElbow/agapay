using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Models;

namespace agapay_backend.Services.Auth
{
    /// <summary>
    /// Outcome of an auth service operation that used to return an IActionResult:
    /// the controller maps these back to the exact same result types/status codes.
    /// </summary>
    public record AuthActionResult(int StatusCode, object? Payload);

    /// <summary>
    /// Auth business logic extracted from AuthController. Every method returns an
    /// AuthActionResult so the controller can map it back to the original
    /// IActionResult types with byte-identical status codes and payloads.
    /// </summary>
    public interface IAuthService
    {
        // OTP-first signup flow (no user created until OTP is verified)
        Task<AuthActionResult> RequestSignupOtpAsync(SignupRequestOtpDto dto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> CompleteSignupAsync(SignupCompleteDto dto, CancellationToken cancellationToken = default);

        // Legacy registration endpoints
        Task<AuthActionResult> RegisterAsync(RegisterDto registerDto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> RegisterPatientAsync(RegisterDto registerDto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> RegisterTherapistAsync(TherapistRegisterDto dto, CancellationToken cancellationToken = default);

        // Role selection / enrollment (require the caller's ClaimsPrincipal)
        Task<AuthActionResult> SelectUserTypeAsync(ClaimsPrincipal principal, UserTypeSelectionDto userTypeDto);
        Task<AuthActionResult> EnrollPatientAsync(ClaimsPrincipal principal);
        Task<AuthActionResult> EnrollTherapistAsync(ClaimsPrincipal principal, EnrollTherapistDto dto);
        Task<AuthActionResult> SetPreferredRoleAsync(ClaimsPrincipal principal, PreferredRoleDto dto);

        // Login / token refresh
        Task<AuthActionResult> LoginAsync(LoginDto loginDto);
        Task<AuthActionResult> LoginPatientAsync(LoginDto dto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> LoginTherapistAsync(LoginDto dto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> RefreshTokenAsync(RefreshTokenDto dto);

        // Generic OTP endpoints
        Task<AuthActionResult> RequestOtpAsync(OtpRequestDto dto, CancellationToken cancellationToken = default);
        Task<AuthActionResult> VerifyOtpAsync(OtpVerifyDto dto, CancellationToken cancellationToken = default);

        // Forgot / reset password flow
        Task<AuthActionResult> ForgotPasswordAsync(ForgotPasswordDto dto);
        Task<AuthActionResult> ResetPasswordAsync(ResetPasswordDto dto);
    }
}
