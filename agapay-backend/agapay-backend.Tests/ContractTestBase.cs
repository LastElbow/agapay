using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

/// <summary>
/// Shared plumbing for HTTP contract tests: these tests exist to freeze the JSON
/// wire shapes the two frontends parse (see TESTING.md). They talk to the real
/// pipeline over HTTP via AuthApiFactory (Testing env + InMemory) and assert raw
/// JsonElement property names — NOT typed DTOs — so any field drift fails loudly.
/// </summary>
public abstract class ContractTestBase : IDisposable
{
  protected readonly AuthApiFactory Factory;
  protected HttpClient Client = null!;

  private readonly IServiceScope _scope;
  private readonly bool _ownsFactory;

  protected ContractTestBase()
    : this(new AuthApiFactory(), ownsFactory: true)
  {
  }

  /// <summary>
  /// Shared-fixture ctor for IClassFixture&lt;AuthApiFactory&gt;: one factory (and thus one
  /// EF internal service provider) per test class instead of one per test. Each
  /// AuthApiFactory builds a distinct EF internal service provider (unique InMemory db
  /// name + root), and EF throws ManyServiceProvidersCreatedWarning once a test run
  /// creates more than 20 of them — so per-class fixtures keep large suites under the cap.
  /// </summary>
  protected ContractTestBase(AuthApiFactory sharedFactory)
    : this(sharedFactory, ownsFactory: false)
  {
  }

  private ContractTestBase(AuthApiFactory factory, bool ownsFactory)
  {
    _ownsFactory = ownsFactory;
    Factory = factory;
    _scope = Factory.Services.CreateScope();
    Db.Database.EnsureCreated();
  }

  /// <summary>Long-lived scope so seeded entities and the resolved managers share one context.</summary>
  protected agapayDbContext Db => _scope.ServiceProvider.GetRequiredService<agapayDbContext>();

  protected UserManager<User> UserManager => _scope.ServiceProvider.GetRequiredService<UserManager<User>>();

  protected RoleManager<Role> RoleManager => _scope.ServiceProvider.GetRequiredService<RoleManager<Role>>();

  // ---- seeding ----

  protected async Task EnsureRolesAsync()
  {
    foreach (var role in new[] { "User", "Patient", "PhysicalTherapist", "Admin" })
    {
      if (!await RoleManager.RoleExistsAsync(role))
      {
        await RoleManager.CreateAsync(new Role { Name = role });
      }
    }
  }

  /// <summary>Creates a confirmed user (roles User+Patient) with a patient profile.</summary>
  protected async Task<User> CreatePatientUserAsync(string email, string password = "Password123!")
  {
    await EnsureRolesAsync();
    var user = await CreateUserAsync(email, password, new[] { "User", "Patient" }, "Patient");
    Db.Patients.Add(new Patient
    {
      UserId = user.Id,
      User = user,
      FirstName = "Patient",
      LastName = "Test",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    });
    await Db.SaveChangesAsync();
    return user;
  }

  /// <summary>Creates a confirmed user (roles User+PhysicalTherapist) with a therapist profile.</summary>
  protected async Task<User> CreateTherapistUserAsync(string email, bool verified = true, string password = "Password123!")
  {
    await EnsureRolesAsync();
    var user = await CreateUserAsync(email, password, new[] { "User", "PhysicalTherapist" }, "Therapist");
    Db.PhysicalTherapists.Add(new PhysicalTherapist
    {
      UserId = user.Id,
      User = user,
      LicenseNumber = "PT-" + Guid.NewGuid().ToString("N")[..8].ToUpperInvariant(),
      VerificationStatus = verified ? VerificationStatus.Verified : VerificationStatus.Pending,
      IsOnboardingComplete = true,
    });
    await Db.SaveChangesAsync();
    return user;
  }

  /// <summary>Creates a confirmed admin user.</summary>
  protected async Task<User> CreateAdminUserAsync(string email, string password = "Password123!")
  {
    await EnsureRolesAsync();
    return await CreateUserAsync(email, password, new[] { "User", "Admin" }, "Admin");
  }

  private async Task<User> CreateUserAsync(string email, string password, string[] roles, string displayName)
  {
    var user = new User
    {
      Id = Guid.NewGuid(),
      UserName = email,
      Email = email,
      EmailConfirmed = true,
      FirstName = displayName,
      LastName = "Test",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
    };
    var result = await UserManager.CreateAsync(user, password);
    Assert.True(result.Succeeded, string.Join(";", result.Errors.Select(e => e.Description)));
    await UserManager.AddToRolesAsync(user, roles);
    await Db.SaveChangesAsync();
    return user;
  }

  // ---- auth + clients ----

  /// <summary>Logs in through the real endpoint (role-fallback order like the app) and returns the access token.</summary>
  protected async Task<string> GetAccessTokenAsync(string email, string password = "Password123!")
  {
    var response = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email, password });
    if (response.IsSuccessStatusCode)
    {
      return await ExtractAccessTokenAsync(response);
    }

    response = await Client.PostAsJsonAsync("/api/Auth/login/therapist", new { email, password });
    if (response.IsSuccessStatusCode)
    {
      return await ExtractAccessTokenAsync(response);
    }

    throw new InvalidOperationException($"Login failed for {email}: {(int)response.StatusCode} {await response.Content.ReadAsStringAsync()}");
  }

  private static async Task<string> ExtractAccessTokenAsync(HttpResponseMessage response)
  {
    using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    return doc.RootElement.GetProperty("accessToken").GetString()
      ?? throw new InvalidOperationException("Login response had no accessToken");
  }

  protected HttpClient AuthenticatedClient(string token)
  {
    var client = Factory.CreateClient();
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    return client;
  }

  /// <summary>Seeded users use @demo.agapay.com emails so the demo OTP backdoor returns tokens directly.</summary>
  protected static string DemoEmail(string prefix) => $"{prefix}-{Guid.NewGuid():N}@demo.agapay.com";

  // ---- JSON assertion helpers ----

  protected static async Task<JsonElement> GetJsonAsync(HttpResponseMessage response)
  {
    response.EnsureSuccessStatusCode();
    var text = await response.Content.ReadAsStringAsync();
    return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
  }

  /// <summary>
  /// Parses the response body as JSON WITHOUT requiring a success status code —
  /// for asserting the error contract ({ code, message, details }) on 4xx responses.
  /// Returns default for an empty body.
  /// </summary>
  protected static async Task<JsonElement> GetJsonUncheckedAsync(HttpResponseMessage response)
  {
    var text = await response.Content.ReadAsStringAsync();
    return text.Length == 0 ? default : JsonDocument.Parse(text).RootElement.Clone();
  }

  /// <summary>Asserts every name is present on the (object) element; the failure message lists what WAS present.</summary>
  protected static void AssertHasFields(JsonElement element, params string[] expectedFields)
  {
    Assert.Equal(JsonValueKind.Object, element.ValueKind);
    var missing = expectedFields.Where(f => !element.TryGetProperty(f, out _)).ToArray();
    Assert.True(missing.Length == 0,
      $"Missing expected response fields: [{string.Join(", ", missing)}]. Present: [{string.Join(", ", element.EnumerateObject().Select(p => p.Name))}]");
  }

  protected static void AssertFieldsOnEveryItem(JsonElement arrayElement, params string[] expectedFields)
  {
    Assert.Equal(JsonValueKind.Array, arrayElement.ValueKind);
    foreach (var item in arrayElement.EnumerateArray())
    {
      AssertHasFields(item, expectedFields);
    }
  }

  public void Dispose()
  {
    Client.Dispose();
    _scope.Dispose();
    if (_ownsFactory)
    {
      Factory.Dispose();
    }
  }
}
