using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

public class AuthControllerSignupTests
{
  [Fact]
  public async Task Signup_RequestOtp_ReturnsOk_ForNewEmail_AndDoesNotCreateUser()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    var userManager = services.GetRequiredService<UserManager<User>>();

    var email = "new@demo.agapay.com";
    Assert.Null(await userManager.FindByEmailAsync(email));

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });

    response.EnsureSuccessStatusCode();
    var payload = await response.Content.ReadFromJsonAsync<JsonElement>();
    Assert.True(payload.GetProperty("requiresOtp").GetBoolean());
    Assert.Equal(email, payload.GetProperty("email").GetString());

    Assert.Null(await userManager.FindByEmailAsync(email));
    Assert.Contains(dbContext.SignupOtpCodes, o => o.NormalizedEmail == email.ToUpperInvariant());
  }

  [Fact]
  public async Task Signup_RequestOtp_ReturnsConflict_WhenEmailAlreadyExists()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    var userManager = services.GetRequiredService<UserManager<User>>();

    var email = "exists@demo.agapay.com";
    var user = new User
    {
      UserName = email,
      Email = email,
      FirstName = "Existing",
      LastName = "User",
      DateOfBirth = new DateOnly(1990, 1, 1),
      EmailConfirmed = true,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    var createResult = await userManager.CreateAsync(user, "ValidPass123!");
    Assert.True(createResult.Succeeded, string.Join(",", createResult.Errors.Select(e => e.Description)));

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });

    Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
  }

  [Fact]
  public async Task Signup_Complete_CreatesPatient_OnlyAfterOtpVerified()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "Patient");

    var userManager = services.GetRequiredService<UserManager<User>>();

    var email = "patient-signup@demo.agapay.com";

    var client = factory.CreateClient();

    var otpResponse = await client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });
    otpResponse.EnsureSuccessStatusCode();

    Assert.Null(await userManager.FindByEmailAsync(email));

    var completeResponse = await client.PostAsJsonAsync("/api/Auth/signup/complete", new
    {
      email,
      code = "123456",
      role = "Patient",
      firstName = "Test",
      lastName = "Patient",
      password = "ValidPass123!",
      dateOfBirth = "1990-01-01",
      gender = (string?)null
    });

    completeResponse.EnsureSuccessStatusCode();

    var payload = await completeResponse.Content.ReadFromJsonAsync<AuthResponseDto>();
    Assert.NotNull(payload);
    Assert.False(string.IsNullOrWhiteSpace(payload!.AccessToken));
    Assert.Equal(email, payload.User?.Email);
    Assert.Contains("Patient", payload.User?.Roles ?? []);

    var createdUser = await userManager.FindByEmailAsync(email);
    Assert.NotNull(createdUser);
    Assert.Contains(dbContext.Patients, p => p.UserId == createdUser!.Id);

    var normalizedEmail = email.ToUpperInvariant();
    Assert.Contains(dbContext.SignupOtpCodes, o => o.NormalizedEmail == normalizedEmail && o.UsedAt != null);
  }

  [Fact]
  public async Task Signup_Complete_ReturnsBadRequest_ForInvalidOtp()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "Patient");

    var email = "bad-otp@demo.agapay.com";

    var client = factory.CreateClient();
    var otpResponse = await client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });
    otpResponse.EnsureSuccessStatusCode();

    var completeResponse = await client.PostAsJsonAsync("/api/Auth/signup/complete", new
    {
      email,
      code = "111111",
      role = "Patient",
      firstName = "Test",
      lastName = "Patient",
      password = "ValidPass123!",
      dateOfBirth = "1990-01-01",
      gender = (string?)null
    });

    Assert.Equal(HttpStatusCode.BadRequest, completeResponse.StatusCode);
    var error = await completeResponse.Content.ReadFromJsonAsync<ErrorResponseDto>();
    Assert.NotNull(error);
    Assert.Equal("InvalidOtp", error!.Code);
  }

  [Fact]
  public async Task Signup_Complete_CreatesTherapist_WithPendingVerification()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "PhysicalTherapist");

    var userManager = services.GetRequiredService<UserManager<User>>();

    var email = "therapist-signup@demo.agapay.com";

    var client = factory.CreateClient();

    var otpResponse = await client.PostAsJsonAsync("/api/Auth/signup/request-otp", new { email });
    otpResponse.EnsureSuccessStatusCode();

    Assert.Null(await userManager.FindByEmailAsync(email));

    var completeResponse = await client.PostAsJsonAsync("/api/Auth/signup/complete", new
    {
      email,
      code = "123456",
      role = "PhysicalTherapist",
      firstName = "Test",
      lastName = "Therapist",
      password = "ValidPass123!",
      dateOfBirth = "1985-05-05",
      gender = (string?)null,
      licenseNumber = "PT-001",
      workPhoneNumber = "09123456789"
    });

    completeResponse.EnsureSuccessStatusCode();

    var payload = await completeResponse.Content.ReadFromJsonAsync<AuthResponseDto>();
    Assert.NotNull(payload);
    Assert.False(string.IsNullOrWhiteSpace(payload!.AccessToken));
    Assert.Equal(email, payload.User?.Email);
    Assert.Equal("Pending", payload.User?.TherapistVerificationStatus);
    Assert.Contains("PhysicalTherapist", payload.User?.Roles ?? []);

    var createdUser = await userManager.FindByEmailAsync(email);
    Assert.NotNull(createdUser);
    Assert.Contains(dbContext.PhysicalTherapists, t => t.UserId == createdUser!.Id && t.LicenseNumber == "PT-001");
  }

  private static async Task EnsureRoleAsync(IServiceProvider services, string roleName)
  {
    var roleManager = services.GetRequiredService<RoleManager<Role>>();
    if (await roleManager.RoleExistsAsync(roleName))
    {
      return;
    }

    var result = await roleManager.CreateAsync(new Role { Name = roleName });
    Assert.True(result.Succeeded, string.Join(",", result.Errors.Select(e => e.Description)));
  }
}
