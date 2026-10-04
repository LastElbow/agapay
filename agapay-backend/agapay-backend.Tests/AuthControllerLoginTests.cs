using System.Net;
using System.Net.Http.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

public class AuthControllerLoginTests
{
  [Fact]
  public async Task LoginPatient_ReturnsUnauthorized_ForInvalidPassword()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "Patient");

    var userManager = services.GetRequiredService<UserManager<User>>();
    var user = new User
    {
      UserName = "patient@example.com",
      Email = "patient@example.com",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      EmailConfirmed = true,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    const string correctPassword = "ValidPass123!";
    var createResult = await userManager.CreateAsync(user, correctPassword);
    Assert.True(createResult.Succeeded, string.Join(",", createResult.Errors.Select(e => e.Description)));
    var roleResult = await userManager.AddToRoleAsync(user, "Patient");
    Assert.True(roleResult.Succeeded, string.Join(",", roleResult.Errors.Select(e => e.Description)));

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/login/patient", new
    {
      email = user.Email,
      password = "WrongPass123!"
    });

    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    var payload = await response.Content.ReadFromJsonAsync<ErrorResponseDto>();
    Assert.NotNull(payload);
    Assert.Equal("InvalidCredentials", payload!.Code);
    Assert.False(string.IsNullOrWhiteSpace(payload.Message));
  }

  [Fact]
  public async Task LoginPatient_ReturnsForbidden_WhenRoleMissing()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "Patient");

    var userManager = services.GetRequiredService<UserManager<User>>();
    var user = new User
    {
      UserName = "norole@example.com",
      Email = "norole@example.com",
      FirstName = "No",
      LastName = "Role",
      DateOfBirth = new DateOnly(1990, 1, 1),
      EmailConfirmed = true,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    const string password = "ValidPass123!";
    var createResult = await userManager.CreateAsync(user, password);
    Assert.True(createResult.Succeeded, string.Join(",", createResult.Errors.Select(e => e.Description)));

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/login/patient", new
    {
      email = user.Email,
      password
    });

    Assert.Equal(HttpStatusCode.Forbidden, response.StatusCode);
    var payload = await response.Content.ReadFromJsonAsync<ErrorResponseDto>();
    Assert.NotNull(payload);
    Assert.Equal("RoleMismatch", payload!.Code);
  }

  [Fact]
  public async Task LoginPatient_ReturnsTokens_ForValidCredentials()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "Patient");

    var userManager = services.GetRequiredService<UserManager<User>>();
    var user = new User
    {
      // Demo accounts bypass 2FA device-trust checks in AuthController
      UserName = "valid@demo.agapay.com",
      Email = "valid@demo.agapay.com",
      FirstName = "Valid",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      EmailConfirmed = true,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    const string password = "ValidPass123!";
    var createResult = await userManager.CreateAsync(user, password);
    Assert.True(createResult.Succeeded, string.Join(",", createResult.Errors.Select(e => e.Description)));
    var roleResult = await userManager.AddToRoleAsync(user, "Patient");
    Assert.True(roleResult.Succeeded, string.Join(",", roleResult.Errors.Select(e => e.Description)));

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/login/patient", new
    {
      email = user.Email,
      password
    });

    response.EnsureSuccessStatusCode();
    var payload = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
    Assert.NotNull(payload);
    Assert.False(string.IsNullOrWhiteSpace(payload!.AccessToken));
    Assert.Equal(user.Email, payload.User?.Email);
    var roles = payload.User?.Roles;
    Assert.NotNull(roles);
    Assert.Contains("Patient", roles!);
  }

  [Fact]
  public async Task LoginTherapist_ReturnsTokens_ForPendingVerificationStatus()
  {
    using var factory = new AuthApiFactory();
    using var scope = factory.Services.CreateScope();
    var services = scope.ServiceProvider;

    var userManager = services.GetRequiredService<UserManager<User>>();
    var dbContext = services.GetRequiredService<agapayDbContext>();
    dbContext.Database.EnsureCreated();

    await EnsureRoleAsync(services, "PhysicalTherapist");

    var user = new User
    {
      // Demo accounts bypass 2FA device-trust checks in AuthController
      UserName = "therapist@demo.agapay.com",
      Email = "therapist@demo.agapay.com",
      FirstName = "Pending",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      EmailConfirmed = true,
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow
    };

    const string password = "ValidPass123!";
    var createResult = await userManager.CreateAsync(user, password);
    Assert.True(createResult.Succeeded, string.Join(",", createResult.Errors.Select(e => e.Description)));

    var roleResult = await userManager.AddToRoleAsync(user, "PhysicalTherapist");
    Assert.True(roleResult.Succeeded, string.Join(",", roleResult.Errors.Select(e => e.Description)));

    dbContext.PhysicalTherapists.Add(new PhysicalTherapist
    {
      UserId = user.Id,
      User = user,
      LicenseNumber = "PT-001",
      VerificationStatus = VerificationStatus.Pending,
      SubmittedAt = DateTime.UtcNow,
      IsOnboardingComplete = false
    });
    await dbContext.SaveChangesAsync();

    var client = factory.CreateClient();
    var response = await client.PostAsJsonAsync("/api/Auth/login/therapist", new
    {
      email = user.Email,
      password
    });

    response.EnsureSuccessStatusCode();
    var payload = await response.Content.ReadFromJsonAsync<AuthResponseDto>();
    Assert.NotNull(payload);
    Assert.False(string.IsNullOrWhiteSpace(payload!.AccessToken));
    Assert.Equal(user.Email, payload.User?.Email);
    Assert.Equal("Pending", payload.User?.TherapistVerificationStatus);
    var roles = payload.User?.Roles;
    Assert.NotNull(roles);
    Assert.Contains("PhysicalTherapist", roles!);
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
