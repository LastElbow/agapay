using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Services.Auth
{
    /// <summary>
    /// Auth business logic extracted verbatim from AuthController. Responses are
    /// returned as AuthActionResult records; AuthController maps them back to the
    /// original IActionResult types so status codes and body shapes stay identical.
    /// </summary>
    public class AuthService : IAuthService
    {
        private readonly agapayDbContext _context;
        private readonly UserManager<User> _userManager;
        private readonly ITokenService _tokenService;
        private readonly IOtpService _otpService;
        private readonly ISignupOtpService _signupOtpService;
        private readonly IEmailService _emailService;
        private readonly IConfiguration _config;
        private readonly bool _demoEmailBypassEnabled;
        private readonly ILogger<AuthService> _logger;

        public AuthService(agapayDbContext context, UserManager<User> userManager, ITokenService tokenService, IOtpService otpService, ISignupOtpService signupOtpService, IEmailService emailService, IConfiguration config, ILogger<AuthService> logger)
        {
            _context = context;
            _userManager = userManager;
            _tokenService = tokenService;
            _otpService = otpService;
            _signupOtpService = signupOtpService;
            _emailService = emailService;
            _config = config;
            _demoEmailBypassEnabled = config.GetValue<bool?>("Auth:DemoEmailBypassEnabled") ?? true;
            _logger = logger;
        }

        // --------------------------------
        // OTP-First Signup Flow (no user created until OTP is verified)
        // --------------------------------

        // POST: /api/Auth/signup/request-otp (body moved from AuthController.RequestSignupOtp)
        public async Task<AuthActionResult> RequestSignupOtpAsync(SignupRequestOtpDto dto, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(dto.Email))
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("InvalidRequest", "Email is required."));
            }

            var existingUser = await _userManager.FindByEmailAsync(dto.Email);
            if (existingUser != null)
            {
                return new AuthActionResult(409, new { message = "Account already exists. Please sign in." });
            }

            var otpResult = await _signupOtpService.GenerateAndSendOtpAsync(
                dto.Email,
                OtpPurpose.AccountVerification,
                cancellationToken);

            if (!otpResult.Success)
            {
                return new AuthActionResult(400, ErrorResponseDto.Create(
                    "OtpRequestFailed",
                    otpResult.Message ?? "Unable to send verification code."));
            }

            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = dto.Email,
                Purpose = OtpPurpose.AccountVerification,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message,
                RoleHint = null
            });
        }

        // POST: /api/Auth/signup/complete (body moved from AuthController.CompleteSignup)
        public async Task<AuthActionResult> CompleteSignupAsync(SignupCompleteDto dto, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Code))
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("InvalidRequest", "Email and code are required."));
            }

            var role = (dto.Role ?? string.Empty).Trim();
            if (role != "Patient" && role != "PhysicalTherapist")
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("InvalidRole", "Invalid role specified."));
            }

            async Task<(AuthResponseDto? response, AuthActionResult? error)> TryCompleteSignupAsync()
            {
                var verification = await _signupOtpService.VerifyOtpAsync(
                    dto.Email,
                    dto.Code,
                    OtpPurpose.AccountVerification,
                    cancellationToken);

                if (!verification.Success)
                {
                    return (null, new AuthActionResult(400, ErrorResponseDto.Create(
                        "InvalidOtp",
                        verification.Message ?? "Invalid verification code.")));
                }

                var existingUser = await _userManager.FindByEmailAsync(dto.Email);
                if (existingUser != null)
                {
                    return (null, new AuthActionResult(409, new { message = "Account already exists. Please sign in." }));
                }

                var user = new User
                {
                    UserName = dto.Email,
                    Email = dto.Email,
                    FirstName = dto.FirstName?.Trim(),
                    LastName = dto.LastName?.Trim(),
                    DateOfBirth = dto.DateOfBirth,
                    Gender = dto.Gender?.Trim(),
                    EmailConfirmed = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow,
                    PreferredRole = role
                };

                var createResult = await _userManager.CreateAsync(user, dto.Password);
                if (!createResult.Succeeded)
                {
                    return (null, new AuthActionResult(400, createResult.Errors));
                }

                if (role == "Patient")
                {
                    await _userManager.AddToRoleAsync(user, "Patient");

                    var patient = new Patient
                    {
                        UserId = user.Id,
                        User = user,
                        FirstName = user.FirstName,
                        LastName = user.LastName,
                        DateOfBirth = user.DateOfBirth,
                        RelationshipToUser = "Self",
                        Gender = dto.Gender?.Trim(),
                        IsActive = true,
                        IsOnboardingComplete = false
                    };

                    _context.Patients.Add(patient);
                    await _context.SaveChangesAsync(cancellationToken);
                }
                else
                {
                    if (string.IsNullOrWhiteSpace(dto.LicenseNumber))
                    {
                        return (null, new AuthActionResult(400, ErrorResponseDto.Create("LicenseRequired", "LicenseNumber is required.")));
                    }

                    await _userManager.AddToRoleAsync(user, "PhysicalTherapist");

                    var therapist = new PhysicalTherapist
                    {
                        UserId = user.Id,
                        User = user,
                        LicenseNumber = dto.LicenseNumber.Trim(),
                        WorkPhoneNumber = string.IsNullOrWhiteSpace(dto.WorkPhoneNumber) ? null : dto.WorkPhoneNumber.Trim(),
                        Gender = dto.Gender?.Trim(),
                        VerificationStatus = VerificationStatus.Pending,
                        SubmittedAt = DateTime.UtcNow,
                        IsOnboardingComplete = false,
                        RatingCount = 0,
                        AverageRating = null
                    };

                    _context.PhysicalTherapists.Add(therapist);
                    await _context.SaveChangesAsync(cancellationToken);
                }

                var roles = await _userManager.GetRolesAsync(user);
                var response = await IssueAuthResponse(user, roles);
                return (response, null);
            }

            if (!_context.Database.IsRelational())
            {
                var outcome = await TryCompleteSignupAsync();
                if (outcome.error != null) return outcome.error;
                return new AuthActionResult(200, outcome.response);
            }

            // Npgsql retry strategy (EnableRetryOnFailure) requires user-initiated transactions
            // to be executed inside the database execution strategy.
            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                await using var tx = await _context.Database.BeginTransactionAsync(cancellationToken);
                var outcome = await TryCompleteSignupAsync();
                if (outcome.error != null)
                {
                    await tx.RollbackAsync(cancellationToken);
                    return outcome.error;
                }

                await tx.CommitAsync(cancellationToken);
                return new AuthActionResult(200, outcome.response);
            });
        }

        // POST: /api/Auth/register (body moved from AuthController.Register)
        public async Task<AuthActionResult> RegisterAsync(RegisterDto registerDto, CancellationToken cancellationToken = default)
        {
            var user = new User
            {
                UserName = registerDto.Email,
                Email = registerDto.Email,
                FirstName = registerDto.FirstName?.Trim(),
                LastName = registerDto.LastName?.Trim(),
                DateOfBirth = registerDto.DateOfBirth,
                Gender = registerDto.Gender?.Trim(),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var createResult = await _userManager.CreateAsync(user, registerDto.Password);
            if (!createResult.Succeeded)
            {
                return new AuthActionResult(400, createResult.Errors);
            }

            await _userManager.AddToRoleAsync(user, "User");

            var desiredRole = registerDto.DesiredRole?.Trim();
            if (!string.IsNullOrEmpty(desiredRole) &&
                desiredRole.Equals("PhysicalTherapist", StringComparison.OrdinalIgnoreCase))
            {
                await _userManager.AddToRoleAsync(user, "PhysicalTherapist");
                user.PreferredRole = "PhysicalTherapist";
            }

            await _userManager.UpdateAsync(user);

            var otpResult = await _otpService.GenerateAndSendOtpAsync(user.Email!, OtpPurpose.AccountVerification, cancellationToken);

            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = user.Email!,
                Purpose = OtpPurpose.AccountVerification,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message,
                RoleHint = desiredRole
            });
        }

        // POST: /api/Auth/register/patient (body moved from AuthController.RegisterPatient)
        public async Task<AuthActionResult> RegisterPatientAsync(RegisterDto registerDto, CancellationToken cancellationToken = default)
        {
            // If email exists, instruct to login and enroll
            var existingUser = await _userManager.FindByEmailAsync(registerDto.Email);
            if (existingUser != null)
            {
                return new AuthActionResult(409, new { message = "Account already exists. Please login and use enroll endpoint.", enrollEndpoint = "/api/auth/enroll/patient" });
            }
            var user = new User
            {
                UserName = registerDto.Email,
                Email = registerDto.Email,
                FirstName = registerDto.FirstName?.Trim(),
                LastName = registerDto.LastName?.Trim(),
                DateOfBirth = registerDto.DateOfBirth,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var result = await _userManager.CreateAsync(user, registerDto.Password);
            if (!result.Succeeded)
            {
                return new AuthActionResult(400, result.Errors);
            }

            await _userManager.AddToRoleAsync(user, "Patient");

            var patient = new Patient
            {
                UserId = user.Id,
                User = user,
                FirstName = user.FirstName,
                LastName = user.LastName,
                DateOfBirth = user.DateOfBirth,
                RelationshipToUser = "Self",
                Gender = registerDto.Gender?.Trim(),
                IsActive = true,
                IsOnboardingComplete = false
            };

            _context.Patients.Add(patient);
            await _context.SaveChangesAsync();
            await _userManager.UpdateAsync(user);

            var otpResult = await _otpService.GenerateAndSendOtpAsync(user.Email!, OtpPurpose.AccountVerification, cancellationToken);

            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = user.Email!,
                Purpose = OtpPurpose.AccountVerification,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message,
                RoleHint = "Patient"
            });
        }

        // POST: /api/Auth/register/therapist (body moved from AuthController.RegisterTherapist)
        public async Task<AuthActionResult> RegisterTherapistAsync(TherapistRegisterDto dto, CancellationToken cancellationToken = default)
        {
            if (string.IsNullOrWhiteSpace(dto.LicenseNumber))
            {
                return new AuthActionResult(400, "LicenseNumber is required");
            }

            var existingByEmail = await _userManager.FindByEmailAsync(dto.Email);
            if (existingByEmail != null)
            {
                return new AuthActionResult(409, new { message = "Account already exists. Please login and use enroll endpoint.", enrollEndpoint = "/api/auth/enroll/therapist" });
            }

            var user = new User
            {
                UserName = dto.Email,
                Email = dto.Email,
                FirstName = dto.FirstName?.Trim(),
                LastName = dto.LastName?.Trim(),
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };

            var result = await _userManager.CreateAsync(user, dto.Password);
            if (!result.Succeeded)
            {
                return new AuthActionResult(400, result.Errors);
            }

            // Immediately grant therapist role so user can authenticate and complete verification later
            await _userManager.AddToRoleAsync(user, "PhysicalTherapist");

            var therapist = new PhysicalTherapist
            {
                UserId = user.Id,
                User = user,
                LicenseNumber = dto.LicenseNumber,
                WorkPhoneNumber = dto.WorkPhoneNumber,
                Gender = dto.Gender?.Trim(),
                VerificationStatus = VerificationStatus.Pending,
                SubmittedAt = DateTime.UtcNow,
                IsOnboardingComplete = false,
                RatingCount = 0,
                AverageRating = null
            };
            _context.PhysicalTherapists.Add(therapist);
            await _context.SaveChangesAsync();

            await _userManager.UpdateAsync(user);

            var otpResult = await _otpService.GenerateAndSendOtpAsync(user.Email!, OtpPurpose.AccountVerification, cancellationToken);

            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = user.Email!,
                Purpose = OtpPurpose.AccountVerification,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message,
                RoleHint = "PhysicalTherapist"
            });
        }

        // POST: /api/Auth/select-user-type (body moved from AuthController.SelectUserType)
        public async Task<AuthActionResult> SelectUserTypeAsync(ClaimsPrincipal principal, UserTypeSelectionDto userTypeDto)
        {
            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return new AuthActionResult(401, null);

            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return new AuthActionResult(404, "User not found");

            string targetRole = userTypeDto.UserType;
            if (targetRole != "Patient" && targetRole != "PhysicalTherapist")
            {
                return new AuthActionResult(400, "Invalid user type specified.");
            }

            if (targetRole == "Patient")
            {
                var currentRoles = await _userManager.GetRolesAsync(user);

                // If user already has the Patient role, treat this as a no-op and return 200 OK with the current user payload.
                // Do NOT update tokens or refresh-token metadata in that case.
                // NOTE: this no-op payload is NOT the shared IssueAuthResponse shape — it keeps
                // empty tokens and a UserType that includes every role (per-endpoint shape freeze).
                if (currentRoles.Contains("Patient"))
                {
                    var (patientComplete, therapistComplete, therapistStatus) = await GetOnboardingStatus(user.Id);

                    return new AuthActionResult(200, new AuthResponseDto
                    {
                        AccessToken = string.Empty,
                        RefreshToken = string.Empty,
                        User = new UserDto
                        {
                            Id = user.Id,
                            Email = user.Email!,
                            FirstName = user.FirstName,
                            LastName = user.LastName,
                            DateOfBirth = user.DateOfBirth,
                            Roles = currentRoles.ToList(),
                            UserType = string.Join(", ", currentRoles),
                            IsPatientOnboardingComplete = patientComplete,
                            IsTherapistOnboardingComplete = therapistComplete,
                            PreferredRole = user.PreferredRole,
                            TherapistVerificationStatus = therapistStatus?.ToString()
                        }
                    });
                }

                await _userManager.AddToRoleAsync(user, "Patient");

                if (currentRoles.Contains("User"))
                {
                    await _userManager.RemoveFromRoleAsync(user, "User");
                }

                if (!await _context.Patients.AnyAsync(p => p.UserId == user.Id))
                {
                    var patient = new Patient
                    {
                        UserId = user.Id,
                        User = user,
                        IsActive = true,
                        FirstName = user.FirstName,
                        LastName = user.LastName,
                        DateOfBirth = user.DateOfBirth,
                        RelationshipToUser = "Self",
                        IsOnboardingComplete = false
                    };
                    _context.Patients.Add(patient);
                }
            }
            else if (targetRole == "PhysicalTherapist")
            {

            }

            await _context.SaveChangesAsync();

            // *** ISSUE A NEW TOKEN WITH THE UPDATED ROLES (if any changed) ***
            var newRoles = await _userManager.GetRolesAsync(user);
            var response = await RotateTokensAndBuildAuthResponseAsync(user, newRoles);
            return new AuthActionResult(200, response);
        }

        // POST: /api/Auth/login (body moved from AuthController.Login)
        public async Task<AuthActionResult> LoginAsync(LoginDto loginDto)
        {
            var user = await _userManager.FindByEmailAsync(loginDto.Email);
            if (user == null)
            {
                return new AuthActionResult(401, ErrorResponseDto.InvalidCredentials());
            }

            var passwordValid = await _userManager.CheckPasswordAsync(user, loginDto.Password);
            if (!passwordValid)
            {
                return new AuthActionResult(401, ErrorResponseDto.InvalidCredentials());
            }

            var roles = await _userManager.GetRolesAsync(user);
            var response = await IssueAuthResponse(user, roles);
            return new AuthActionResult(200, response);
        }

        // POST: /api/Auth/refresh (body moved from AuthController.RefreshToken)
        public async Task<AuthActionResult> RefreshTokenAsync(RefreshTokenDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.AccessToken) || string.IsNullOrWhiteSpace(dto.RefreshToken))
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("TokenValidationFailed", "Both access and refresh tokens are required."));
            }

            ClaimsPrincipal principal;
            try
            {
                principal = _tokenService.GetPrincipalFromExpiredToken(dto.AccessToken);
            }
            catch
            {
                return new AuthActionResult(401, ErrorResponseDto.Create("InvalidAccessToken", "Access token could not be validated."));
            }

            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return new AuthActionResult(401, ErrorResponseDto.Create("UserNotIdentified", "Token did not contain a valid user identifier."));

            if (!Guid.TryParse(userId, out var guidUserId))
            {
                return new AuthActionResult(401, ErrorResponseDto.Create("InvalidUserIdentifier", "Token did not contain a valid user identifier."));
            }

            var user = await _userManager.Users.FirstOrDefaultAsync(u => u.Id == guidUserId);
            if (user == null) return new AuthActionResult(401, ErrorResponseDto.Create("UserNotFound", "Account associated with this token no longer exists."));

            if (user.RefreshToken != dto.RefreshToken || user.RefreshTokenExpiryTime == null || user.RefreshTokenExpiryTime < DateTime.UtcNow)
            {
                return new AuthActionResult(401, ErrorResponseDto.Create("RefreshTokenExpired", "Invalid or expired refresh token."));
            }

            var roles = await _userManager.GetRolesAsync(user);
            var newAccessToken = _tokenService.CreateAccessToken(user, roles);
            var newRefreshToken = _tokenService.CreateRefreshToken();

            user.RefreshToken = newRefreshToken;
            user.RefreshTokenExpiryTime = GetRefreshTokenExpiry();
            await _userManager.UpdateAsync(user);

            // NOTE: RefreshToken's UserType intentionally filters "User" case-SENSITIVELY with no
            // fallback — it differs from IssueAuthResponse and must not be routed through it.
            var userType = string.Join(", ", roles.Where(r => r != "User"));
            var response = await BuildAuthResponseAsync(user, roles, newAccessToken, newRefreshToken, userType);
            return new AuthActionResult(200, response);
        }

        // POST: /api/Auth/login/patient (body moved from AuthController.LoginPatient)
        public Task<AuthActionResult> LoginPatientAsync(LoginDto dto, CancellationToken cancellationToken = default)
            => LoginWithRoleAsync(dto, "Patient", "Account is not registered as a patient.", "Patient", cancellationToken);

        // POST: /api/Auth/login/therapist (body moved from AuthController.LoginTherapist)
        public Task<AuthActionResult> LoginTherapistAsync(LoginDto dto, CancellationToken cancellationToken = default)
            => LoginWithRoleAsync(dto, "PhysicalTherapist", "Account is not registered as a physical therapist.", "PhysicalTherapist", cancellationToken);

        // Shared core of LoginPatient/LoginTherapist: only the required role string,
        // the RoleMismatch message and the RoleHint differ between the two endpoints.
        private async Task<AuthActionResult> LoginWithRoleAsync(LoginDto dto, string requiredRole, string roleMismatchMessage, string roleHint, CancellationToken cancellationToken)
        {
            var user = await _userManager.FindByEmailAsync(dto.Email);
            if (user == null)
            {
                return new AuthActionResult(401, ErrorResponseDto.InvalidCredentials());
            }

            var passwordValid = await _userManager.CheckPasswordAsync(user, dto.Password);
            if (!passwordValid)
            {
                return new AuthActionResult(401, ErrorResponseDto.InvalidCredentials());
            }

            var roles = await _userManager.GetRolesAsync(user);
            if (!roles.Contains(requiredRole))
            {
                return new AuthActionResult(StatusCodes.Status403Forbidden, ErrorResponseDto.RoleMismatch(roleMismatchMessage));
            }

            var deviceTrusted = await _otpService.IsDeviceTrustedAsync(user.Id, dto.DeviceId, cancellationToken);
            if (deviceTrusted || IsDemoEmailOtpBypass(user.Email))
            {
                var response = await IssueAuthResponse(user, roles);
                return new AuthActionResult(200, response);
            }

            var otpResult = await _otpService.GenerateAndSendOtpAsync(user.Email!, OtpPurpose.TwoFactorLogin, cancellationToken);

            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = user.Email!,
                Purpose = OtpPurpose.TwoFactorLogin,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message,
                RoleHint = roleHint
            });
        }

        // POST: /api/Auth/request-otp (body moved from AuthController.RequestOtp)
        public async Task<AuthActionResult> RequestOtpAsync(OtpRequestDto dto, CancellationToken cancellationToken = default)
        {
            var otpResult = await _otpService.GenerateAndSendOtpAsync(dto.Email, dto.Purpose, cancellationToken);
            return new AuthActionResult(200, new OtpChallengeResponseDto
            {
                Email = dto.Email,
                Purpose = dto.Purpose,
                ExpiresAtUtc = otpResult.ExpiresAtUtc,
                Message = otpResult.Message
            });
        }

        // POST: /api/Auth/verify-otp (body moved from AuthController.VerifyOtp)
        public async Task<AuthActionResult> VerifyOtpAsync(OtpVerifyDto dto, CancellationToken cancellationToken = default)
        {
            var verification = await _otpService.VerifyOtpAsync(dto.Email, dto.Code, dto.Purpose, cancellationToken);
            if (!verification.Success || verification.UserId is null)
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("InvalidOtp", verification.Message ?? "Invalid verification code."));
            }

            var user = await _userManager.FindByIdAsync(verification.UserId.Value.ToString());
            if (user == null)
            {
                return new AuthActionResult(400, ErrorResponseDto.Create("UserNotFound", "Account could not be located."));
            }

            if (dto.Purpose == OtpPurpose.AccountVerification && !user.EmailConfirmed)
            {
                user.EmailConfirmed = true;
            }

            var roles = await _userManager.GetRolesAsync(user);
            if (dto.RememberDevice && !string.IsNullOrWhiteSpace(dto.DeviceId))
            {
                await _otpService.RegisterTrustedDeviceAsync(user.Id, dto.DeviceId, dto.DeviceName, cancellationToken);
            }

            var response = await IssueAuthResponse(user, roles);
            return new AuthActionResult(200, response);
        }

        // POST: /api/Auth/enroll/patient (body moved from AuthController.EnrollPatient)
        public async Task<AuthActionResult> EnrollPatientAsync(ClaimsPrincipal principal)
        {
            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return new AuthActionResult(401, null);
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return new AuthActionResult(401, null);

            var roles = await _userManager.GetRolesAsync(user);
            bool added = false;
            if (!roles.Contains("Patient"))
            {
                await _userManager.AddToRoleAsync(user, "Patient");
                added = true;
            }

            if (!await _context.Patients.AnyAsync(p => p.UserId == user.Id))
            {
                _context.Patients.Add(new Patient
                {
                    UserId = user.Id,
                    User = user,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    DateOfBirth = user.DateOfBirth,
                    RelationshipToUser = "Self",
                    Gender = null,
                    IsActive = true,
                    IsOnboardingComplete = false
                });
                await _context.SaveChangesAsync();
            }

            if (added)
            {
                roles = await _userManager.GetRolesAsync(user);
            }

            var response = await RotateTokensAndBuildAuthResponseAsync(user, roles);
            return new AuthActionResult(200, response);
        }

        // POST: /api/Auth/enroll/therapist (body moved from AuthController.EnrollTherapist)
        public async Task<AuthActionResult> EnrollTherapistAsync(ClaimsPrincipal principal, EnrollTherapistDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.LicenseNumber)) return new AuthActionResult(400, "LicenseNumber required");
            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return new AuthActionResult(401, null);
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return new AuthActionResult(401, null);

            // If therapist profile exists return existing state
            var therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(t => t.UserId == user.Id);
            if (therapist == null)
            {
                therapist = new PhysicalTherapist
                {
                    UserId = user.Id,
                    User = user,
                    LicenseNumber = dto.LicenseNumber,
                    WorkPhoneNumber = dto.WorkPhoneNumber,
                    Gender = dto.Gender?.Trim(),
                    VerificationStatus = VerificationStatus.Pending,
                    SubmittedAt = DateTime.UtcNow,
                    IsOnboardingComplete = false,
                    RatingCount = 0,
                    AverageRating = null
                };
                _context.PhysicalTherapists.Add(therapist);
                await _context.SaveChangesAsync();
            }
            else
            {
                var normalizedGender = string.IsNullOrWhiteSpace(dto.Gender) ? null : dto.Gender.Trim();
                var hasChanges = false;
                if (!string.IsNullOrWhiteSpace(dto.LicenseNumber) && !string.Equals(therapist.LicenseNumber, dto.LicenseNumber, StringComparison.Ordinal))
                {
                    therapist.LicenseNumber = dto.LicenseNumber;
                    hasChanges = true;
                }
                if (dto.WorkPhoneNumber is not null && !string.Equals(therapist.WorkPhoneNumber, dto.WorkPhoneNumber, StringComparison.Ordinal))
                {
                    therapist.WorkPhoneNumber = dto.WorkPhoneNumber;
                    hasChanges = true;
                }
                if (therapist.Gender != normalizedGender)
                {
                    therapist.Gender = normalizedGender;
                    hasChanges = true;
                }

                if (hasChanges)
                {
                    _context.PhysicalTherapists.Update(therapist);
                    await _context.SaveChangesAsync();
                }
            }

            // Ensure user has PhysicalTherapist role so they can login and complete verification
            var roles = await _userManager.GetRolesAsync(user);
            if (!roles.Contains("PhysicalTherapist"))
            {
                await _userManager.AddToRoleAsync(user, "PhysicalTherapist");
                roles = await _userManager.GetRolesAsync(user);
            }
            var response = await RotateTokensAndBuildAuthResponseAsync(user, roles);
            return new AuthActionResult(200, response);
        }

        // PATCH: /api/Auth/preferred-role (body moved from AuthController.SetPreferredRole)
        public async Task<AuthActionResult> SetPreferredRoleAsync(ClaimsPrincipal principal, PreferredRoleDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.PreferredRole)) return new AuthActionResult(400, "PreferredRole required");
            var allowed = new[] { "Patient", "PhysicalTherapist" };
            if (!allowed.Contains(dto.PreferredRole)) return new AuthActionResult(400, "Invalid preferred role");

            var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return new AuthActionResult(401, null);
            var user = await _userManager.FindByIdAsync(userId);
            if (user == null) return new AuthActionResult(401, null);

            var roles = await _userManager.GetRolesAsync(user);
            if (!roles.Contains(dto.PreferredRole)) return new AuthActionResult(400, "User does not have this role");

            user.PreferredRole = dto.PreferredRole;
            await _userManager.UpdateAsync(user);
            return new AuthActionResult(204, null);
        }

        /// <summary>
        /// Demo-account 2FA bypass for @demo.agapay.com emails. Gated by Auth:DemoEmailBypassEnabled
        /// (default true preserves historical behavior; set false in production config to require real OTP).
        /// </summary>
        private bool IsDemoEmailOtpBypass(string? email)
        {
            if (!_demoEmailBypassEnabled) return false;
            return !string.IsNullOrWhiteSpace(email) &&
                   email.EndsWith("@demo.agapay.com", StringComparison.OrdinalIgnoreCase);
        }

        private async Task<AuthResponseDto> IssueAuthResponse(User user, IList<string> roles)
        {
            var accessToken = _tokenService.CreateAccessToken(user, roles);
            var refreshToken = _tokenService.CreateRefreshToken();

            user.RefreshToken = refreshToken;
            user.RefreshTokenExpiryTime = GetRefreshTokenExpiry();
            await _userManager.UpdateAsync(user);

            var roleList = roles.ToList();
            var primaryRoles = roleList.Where(r => !string.Equals(r, "User", StringComparison.OrdinalIgnoreCase)).ToList();
            var userType = primaryRoles.Count > 0 ? string.Join(", ", primaryRoles) : string.Join(", ", roleList);

            return await BuildAuthResponseAsync(user, roleList, accessToken, refreshToken, userType);
        }

        // Single refresh-expiry computation for every endpoint that stores refresh-token
        // metadata (moved from the repeated inline Convert.ToDouble(_config[...]) reads).
        private DateTime GetRefreshTokenExpiry() =>
            DateTime.UtcNow.AddDays(Convert.ToDouble(_config["Jwt:RefreshTokenExpirationDays"]));

        // Shared token-rotation tail of SelectUserType, EnrollPatient and EnrollTherapist:
        // issues a fresh token pair, persists refresh-token metadata, and builds the
        // AuthResponseDto with UserType = string.Join(", ", roles) (includes every role,
        // which is intentionally different from IssueAuthResponse's "User"-filtered UserType).
        private async Task<AuthResponseDto> RotateTokensAndBuildAuthResponseAsync(User user, IList<string> roles)
        {
            var accessToken = _tokenService.CreateAccessToken(user, roles);
            var refreshToken = _tokenService.CreateRefreshToken();

            user.RefreshToken = refreshToken;
            user.RefreshTokenExpiryTime = GetRefreshTokenExpiry();
            await _userManager.UpdateAsync(user);

            var userType = string.Join(", ", roles);
            return await BuildAuthResponseAsync(user, roles, accessToken, refreshToken, userType);
        }

        // Builds the AuthResponseDto/UserDto payload shared by every token-issuing
        // endpoint. The field set and values are byte-identical to the original
        // hand-rolled blocks; only the userType string differs per endpoint and is
        // therefore passed in by each caller.
        private async Task<AuthResponseDto> BuildAuthResponseAsync(User user, IList<string> roles, string accessToken, string refreshToken, string userType)
        {
            var (patientComplete, therapistComplete, therapistStatus) = await GetOnboardingStatus(user.Id);

            return new AuthResponseDto
            {
                AccessToken = accessToken,
                RefreshToken = refreshToken,
                User = new UserDto
                {
                    Id = user.Id,
                    Email = user.Email!,
                    FirstName = user.FirstName,
                    LastName = user.LastName,
                    DateOfBirth = user.DateOfBirth,
                    Roles = roles.ToList(),
                    UserType = userType,
                    IsPatientOnboardingComplete = patientComplete,
                    IsTherapistOnboardingComplete = therapistComplete,
                    PreferredRole = user.PreferredRole,
                    TherapistVerificationStatus = therapistStatus?.ToString()
                }
            };
        }

        private async Task<(bool patientComplete, bool therapistComplete, VerificationStatus? therapistStatus)> GetOnboardingStatus(Guid userId)
        {
            var patientComplete = await _context.Patients.AnyAsync(p => p.UserId == userId && p.IsOnboardingComplete);

            var therapist = await _context.PhysicalTherapists.AsNoTracking().FirstOrDefaultAsync(pt => pt.UserId == userId);
            bool therapistComplete = therapist is not null && therapist.IsOnboardingComplete;
            var therapistStatus = therapist?.VerificationStatus;

            return (patientComplete, therapistComplete, therapistStatus);
        }

        // POST: /api/Auth/forgot-password (body moved from AuthController.ForgotPassword)
        public async Task<AuthActionResult> ForgotPasswordAsync(ForgotPasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email)) return new AuthActionResult(400, "Email is required");

            var user = await _userManager.FindByEmailAsync(dto.Email);

            // Always return 200 to avoid account enumeration
            if (user == null)
            {
                return new AuthActionResult(200, new { message = "If an account with that email exists, a password reset link has been sent." });
            }

            var token = await _userManager.GeneratePasswordResetTokenAsync(user);
            // URL-safe encode
            var encodedToken = System.Web.HttpUtility.UrlEncode(token);

            // Build reset URL (for real emails / deep link). Frontend can handle route like /reset-password?email=...&token=...
            var frontendBase = _config["Frontend:BaseUrl"] ?? "http://localhost:19006"; // fallback dev
            var resetUrl = $"{frontendBase}/reset-password?email={System.Web.HttpUtility.UrlEncode(user.Email)}&token={encodedToken}";

            await _emailService.SendPasswordResetEmailAsync(user.Email!, resetUrl, token);

            // In Development environment optionally return the raw token to speed local testing.
            var isDev = string.Equals(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT"), "Development", StringComparison.OrdinalIgnoreCase) || _config["Environment"] == "Development";

            return new AuthActionResult(200, new
            {
                message = "If an account with that email exists, a password reset link has been sent.",
                devToken = isDev ? token : null,
                resetUrl = isDev ? resetUrl : null
            });
        }

        // POST: /api/Auth/reset-password (body moved from AuthController.ResetPassword)
        public async Task<AuthActionResult> ResetPasswordAsync(ResetPasswordDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.Email) || string.IsNullOrWhiteSpace(dto.Token) || string.IsNullOrWhiteSpace(dto.NewPassword))
            {
                return new AuthActionResult(400, "Email, token and new password are required");
            }

            var user = await _userManager.FindByEmailAsync(dto.Email);
            // Same neutral response strategy
            if (user == null)
            {
                await Task.Delay(50); // tiny delay to mimic work
                return new AuthActionResult(200, new { message = "Password has been reset." });
            }

            // Token may arrive URL-encoded
            var decodedToken = System.Web.HttpUtility.UrlDecode(dto.Token);
            var result = await _userManager.ResetPasswordAsync(user, decodedToken, dto.NewPassword);
            if (!result.Succeeded)
            {
                return new AuthActionResult(400, new { errors = result.Errors.Select(e => e.Description).ToArray() });
            }

            return new AuthActionResult(200, new { message = "Password has been reset." });
        }
    }
}
