using agapay_backend.Models;
using agapay_backend.Services.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Threading.Tasks;

namespace agapay_backend.Controllers
{
  [Route("api/[controller]")]
  [ApiController]
  public class AuthController : ControllerBase
  {
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
      _authService = authService;
    }

    // Maps an AuthActionResult back to the same IActionResult type the extracted
    // endpoint body used to return, so status codes and result types stay byte-identical.
    // Note: 403 must carry the RoleMismatch error body, so it maps to
    // StatusCode(403, payload) rather than Forbid().
    private IActionResult ToActionResult(AuthActionResult result)
    {
      return result.StatusCode switch
      {
        200 => result.Payload is null ? Ok() : Ok(result.Payload),
        201 => result.Payload is null ? StatusCode(201) : StatusCode(201, result.Payload),
        204 => NoContent(),
        400 => result.Payload is null ? BadRequest() : BadRequest(result.Payload),
        401 => result.Payload is null ? Unauthorized() : Unauthorized(result.Payload),
        403 => result.Payload is null ? StatusCode(403) : StatusCode(403, result.Payload),
        404 => result.Payload is null ? NotFound() : NotFound(result.Payload),
        409 => result.Payload is null ? Conflict() : Conflict(result.Payload),
        _ => StatusCode(result.StatusCode, result.Payload)
      };
    }

    // --------------------------------
    // OTP-First Signup Flow (no user created until OTP is verified)
    // --------------------------------

    [HttpPost("signup/request-otp")]
    [AllowAnonymous]
    public async Task<IActionResult> RequestSignupOtp(Models.SignupRequestOtpDto dto)
    {
      return ToActionResult(await _authService.RequestSignupOtpAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("signup/complete")]
    [AllowAnonymous]
    public async Task<IActionResult> CompleteSignup(Models.SignupCompleteDto dto)
    {
      return ToActionResult(await _authService.CompleteSignupAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register(RegisterDto registerDto)
    {
      return ToActionResult(await _authService.RegisterAsync(registerDto, HttpContext.RequestAborted));
    }

    [HttpPost("register/patient")]
    public async Task<IActionResult> RegisterPatient(RegisterDto registerDto)
    {
      return ToActionResult(await _authService.RegisterPatientAsync(registerDto, HttpContext.RequestAborted));
    }

    [HttpPost("register/therapist")]
    public async Task<IActionResult> RegisterTherapist(TherapistRegisterDto dto)
    {
      return ToActionResult(await _authService.RegisterTherapistAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("select-user-type")]
    [Authorize]
    public async Task<IActionResult> SelectUserType(UserTypeSelectionDto userTypeDto)
    {
      return ToActionResult(await _authService.SelectUserTypeAsync(User, userTypeDto));
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto loginDto)
    {
      return ToActionResult(await _authService.LoginAsync(loginDto));
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken(RefreshTokenDto dto)
    {
      return ToActionResult(await _authService.RefreshTokenAsync(dto));
    }

    [HttpPost("login/patient")]
    public async Task<IActionResult> LoginPatient(LoginDto dto)
    {
      return ToActionResult(await _authService.LoginPatientAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("login/therapist")]
    public async Task<IActionResult> LoginTherapist(LoginDto dto)
    {
      return ToActionResult(await _authService.LoginTherapistAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("request-otp")]
    [AllowAnonymous]
    public async Task<IActionResult> RequestOtp(OtpRequestDto dto)
    {
      return ToActionResult(await _authService.RequestOtpAsync(dto, HttpContext.RequestAborted));
    }

    [HttpPost("verify-otp")]
    [AllowAnonymous]
    public async Task<IActionResult> VerifyOtp(OtpVerifyDto dto)
    {
      return ToActionResult(await _authService.VerifyOtpAsync(dto, HttpContext.RequestAborted));
    }

    // Enroll existing authenticated user as Patient (idempotent)
    [HttpPost("enroll/patient")]
    [Authorize]
    public async Task<IActionResult> EnrollPatient()
    {
      return ToActionResult(await _authService.EnrollPatientAsync(User));
    }

    // Enroll existing authenticated user as Therapist Applicant (does not grant PhysicalTherapist yet)
    [HttpPost("enroll/therapist")]
    [Authorize]
    public async Task<IActionResult> EnrollTherapist(EnrollTherapistDto dto)
    {
      return ToActionResult(await _authService.EnrollTherapistAsync(User, dto));
    }

    [HttpPatch("preferred-role")]
    [Authorize]
    public async Task<IActionResult> SetPreferredRole(PreferredRoleDto dto)
    {
      return ToActionResult(await _authService.SetPreferredRoleAsync(User, dto));
    }

    // -------------------------------
    // Forgot / Reset Password Flow
    // -------------------------------

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(ForgotPasswordDto dto)
    {
      return ToActionResult(await _authService.ForgotPasswordAsync(dto));
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(ResetPasswordDto dto)
    {
      return ToActionResult(await _authService.ResetPasswordAsync(dto));
    }
  }
}
