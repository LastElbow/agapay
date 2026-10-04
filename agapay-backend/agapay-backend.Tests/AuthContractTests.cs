using System.Globalization;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Mvc.Testing;

namespace agapay_backend.Tests;

/// <summary>
/// Wire-shape contract tests for the auth endpoints the mobile app parses.
/// Freezes the exact camelCase field names and values of the raw JSON (see TESTING.md):
/// login/auth-response shape, OTP challenge shape, refresh quirk and forgot-password shape.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so they
/// can safely share the class's InMemory database.
/// </summary>
public class AuthContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public AuthContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  [Fact]
  public async Task Login_Patient_ReturnsFullAuthShape()
  {
    var email = DemoEmail("login-patient");
    await CreatePatientUserAsync(email);

    var response = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password = "Password123!" });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var root = await GetJsonAsync(response);

    AssertHasFields(root, "accessToken", "refreshToken", "user", "homePath");
    Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("accessToken").GetString()));
    Assert.False(string.IsNullOrWhiteSpace(root.GetProperty("refreshToken").GetString()));
    Assert.Equal(JsonValueKind.Null, root.GetProperty("homePath").ValueKind);

    var user = root.GetProperty("user");
    AssertHasFields(user,
      "id", "email", "firstName", "lastName", "dateOfBirth", "roles", "userType",
      "isPatientOnboardingComplete", "isTherapistOnboardingComplete", "preferredRole",
      "therapistVerificationStatus");
    Assert.Equal(email, user.GetProperty("email").GetString());
    Assert.Equal("Patient", user.GetProperty("userType").GetString());
    Assert.Equal(JsonValueKind.Array, user.GetProperty("roles").ValueKind);
    Assert.Contains("Patient", user.GetProperty("roles").EnumerateArray().Select(r => r.GetString()));

    // DateOnly wire format is yyyy-MM-dd.
    Assert.True(
      DateOnly.TryParseExact(user.GetProperty("dateOfBirth").GetString(), "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _),
      $"dateOfBirth '{user.GetProperty("dateOfBirth").GetString()}' is not in yyyy-MM-dd format.");
  }

  [Fact]
  public async Task Login_Therapist_ReturnsVerificationStatus()
  {
    var email = DemoEmail("login-therapist");
    await CreateTherapistUserAsync(email, verified: false);

    var response = await Client.PostAsJsonAsync("/api/Auth/login/therapist", new { email, password = "Password123!" });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var root = await GetJsonAsync(response);
    var user = root.GetProperty("user");
    AssertHasFields(user, "email", "roles", "therapistVerificationStatus");
    Assert.Equal("Pending", user.GetProperty("therapistVerificationStatus").GetString());
    Assert.Contains("PhysicalTherapist", user.GetProperty("roles").EnumerateArray().Select(r => r.GetString()));
  }

  [Fact]
  public async Task Login_WrongPassword_ReturnsInvalidCredentialsShape()
  {
    var email = DemoEmail("login-wrongpw");
    await CreatePatientUserAsync(email);

    var response = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password = "WrongPass123!" });

    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    var body = await GetJsonUncheckedAsync(response);
    Assert.Equal("InvalidCredentials", body.GetProperty("code").GetString());
    Assert.Equal("Email or password is incorrect.", body.GetProperty("message").GetString());
  }

  [Fact]
  public async Task Login_RoleMismatch_ReturnsRoleMismatchShape()
  {
    // Seeded as PATIENT but logged in through the therapist endpoint —
    // the app branches on this exact code/message pair.
    var email = DemoEmail("login-mismatch");
    await CreatePatientUserAsync(email);

    var response = await Client.PostAsJsonAsync("/api/Auth/login/therapist", new { email, password = "Password123!" });

    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    var body = await GetJsonUncheckedAsync(response);
    Assert.Equal("RoleMismatch", body.GetProperty("code").GetString());
    Assert.Equal("Account is not registered as a physical therapist.", body.GetProperty("message").GetString());
  }

  [Fact]
  public async Task Login_NonDemoEmail_ReturnsOtpChallenge()
  {
    var email = $"no-otp-{Guid.NewGuid():N}@example.com"; // NOT @demo.agapay.com -> no OTP bypass
    await CreatePatientUserAsync(email);

    var response = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password = "Password123!" });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var challenge = await GetJsonAsync(response);
    AssertHasFields(challenge, "requiresOtp", "email", "purpose", "expiresAtUtc", "message", "roleHint");
    Assert.True(challenge.GetProperty("requiresOtp").GetBoolean());
    Assert.Equal(email, challenge.GetProperty("email").GetString());
    Assert.Equal("TwoFactorLogin", challenge.GetProperty("purpose").GetString());
    Assert.Equal("Patient", challenge.GetProperty("roleHint").GetString());

    // The challenge REPLACES the auth payload — no token fields on this shape.
    Assert.False(challenge.TryGetProperty("accessToken", out _), "OTP challenge must not carry accessToken");
    Assert.False(challenge.TryGetProperty("refreshToken", out _), "OTP challenge must not carry refreshToken");
  }

  [Fact]
  public async Task Signup_RequestOtpThenComplete_ReturnsAuthResponse()
  {
    var email = DemoEmail("signup");
    var firstName = "Signup";
    var lastName = "Tester";

    var requestOtp = await Client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });
    Assert.Equal(HttpStatusCode.OK, requestOtp.StatusCode);
    var otpChallenge = await GetJsonAsync(requestOtp);
    AssertHasFields(otpChallenge, "requiresOtp", "email", "purpose", "expiresAtUtc", "message", "roleHint");
    Assert.Equal(email, otpChallenge.GetProperty("email").GetString());
    Assert.Equal("AccountVerification", otpChallenge.GetProperty("purpose").GetString());

    // Demo-account fixed OTP code (Otp:DemoFixedCodeEnabled + Seed:BypassOtpForDemoAccounts).
    var complete = await Client.PostAsJsonAsync("/api/Auth/signup/complete", new
    {
      email,
      code = "123456",
      role = "Patient",
      firstName,
      lastName,
      password = "Password123!",
      dateOfBirth = "1995-05-05"
    });
    Assert.Equal(HttpStatusCode.OK, complete.StatusCode);

    var auth = await GetJsonAsync(complete);
    Assert.False(string.IsNullOrWhiteSpace(auth.GetProperty("accessToken").GetString()));
    var user = auth.GetProperty("user");
    Assert.False(string.IsNullOrWhiteSpace(user.GetProperty("id").GetString()));
    Assert.Contains("Patient", user.GetProperty("roles").EnumerateArray().Select(r => r.GetString()));
    Assert.Equal("Patient", user.GetProperty("userType").GetString());

    // The account created by signup must really work on the login endpoint.
    var login = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password = "Password123!" });
    Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    var loginBody = await GetJsonAsync(login);
    Assert.False(string.IsNullOrWhiteSpace(loginBody.GetProperty("accessToken").GetString()));
    Assert.Equal(email, loginBody.GetProperty("user").GetProperty("email").GetString());
  }

  [Fact]
  public async Task Refresh_ReturnsShape_AndCaseSensitiveUserType()
  {
    // --- Regular patient: refresh returns the full auth shape with a proper userType.
    var email = DemoEmail("refresh-patient");
    await CreatePatientUserAsync(email);
    var login = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password = "Password123!" });
    Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    var loginBody = await GetJsonAsync(login);

    var response = await Client.PostAsJsonAsync("/api/Auth/refresh", new
    {
      refreshToken = loginBody.GetProperty("refreshToken").GetString(),
      accessToken = loginBody.GetProperty("accessToken").GetString()
    });
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var refreshBody = await GetJsonAsync(response);
    AssertHasFields(refreshBody, "accessToken", "refreshToken", "user", "homePath");
    Assert.False(string.IsNullOrWhiteSpace(refreshBody.GetProperty("accessToken").GetString()));
    Assert.Equal("Patient", refreshBody.GetProperty("user").GetProperty("userType").GetString());

    // --- FROZEN QUIRK: RefreshTokenAsync computes userType with a case-SENSITIVE
    // "User" filter and NO fallback (unlike login's IssueAuthResponse). A user whose
    // only role is "User" therefore refreshes to userType == "".
    await EnsureRolesAsync();
    var userOnlyEmail = DemoEmail("refresh-useronly");
    var userOnly = new User
    {
      Id = Guid.NewGuid(),
      UserName = userOnlyEmail,
      Email = userOnlyEmail,
      EmailConfirmed = true,
      FirstName = "User",
      LastName = "Only",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
    };
    var createResult = await UserManager.CreateAsync(userOnly, "Password123!");
    Assert.True(createResult.Succeeded, string.Join(";", createResult.Errors.Select(e => e.Description)));
    var roleResult = await UserManager.AddToRoleAsync(userOnly, "User");
    Assert.True(roleResult.Succeeded, string.Join(";", roleResult.Errors.Select(e => e.Description)));
    await Db.SaveChangesAsync();

    var genericLogin = await Client.PostAsJsonAsync("/api/Auth/login", new { email = userOnlyEmail, password = "Password123!" });
    Assert.Equal(HttpStatusCode.OK, genericLogin.StatusCode);
    var genericBody = await GetJsonAsync(genericLogin);
    // Login's IssueAuthResponse falls back to the full role list when no primary role exists.
    Assert.Equal("User", genericBody.GetProperty("user").GetProperty("userType").GetString());

    var genericRefresh = await Client.PostAsJsonAsync("/api/Auth/refresh", new
    {
      refreshToken = genericBody.GetProperty("refreshToken").GetString(),
      accessToken = genericBody.GetProperty("accessToken").GetString()
    });
    Assert.Equal(HttpStatusCode.OK, genericRefresh.StatusCode);
    var genericRefreshBody = await GetJsonAsync(genericRefresh);
    Assert.Equal("", genericRefreshBody.GetProperty("user").GetProperty("userType").GetString());
  }

  [Fact]
  public async Task ForgotPassword_ReturnsMessageShape()
  {
    var email = DemoEmail("forgot");
    await CreatePatientUserAsync(email);

    var response = await Client.PostAsJsonAsync("/api/Auth/forgot-password", new { email });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message");
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));

    // devToken/resetUrl are Development-only. In Testing they carry no real reset
    // material; NOTE: the anonymous payload serializes them as explicit JSON nulls
    // (not omitted properties).
    Assert.Equal(JsonValueKind.Null, body.GetProperty("devToken").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("resetUrl").ValueKind);
  }
}
