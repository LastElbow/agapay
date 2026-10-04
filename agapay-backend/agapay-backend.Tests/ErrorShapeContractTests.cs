using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;

namespace agapay_backend.Tests;

/// <summary>
/// Error-contract tests: freezes the exact wire shapes of 4xx responses the
/// frontends parse — the { code, message, details } error contract, plain-string
/// NotFound bodies, message-object 409s, and empty 401 challenge bodies.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so they
/// can safely share the class's InMemory database.
/// </summary>
public class ErrorShapeContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public ErrorShapeContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  [Fact]
  public async Task ModelBindingFailure_ReturnsValidationErrorShape()
  {
    // "email": 123 cannot bind to the string Email property -> automatic 400.
    var response = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email = 123, password = "x" });

    Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    var body = await GetJsonUncheckedAsync(response);
    Assert.Equal("VALIDATION_ERROR", body.GetProperty("code").GetString());
    Assert.Equal("One or more validation errors occurred.", body.GetProperty("message").GetString());

    var details = body.GetProperty("details");
    Assert.Equal(JsonValueKind.Object, details.ValueKind);
    Assert.True(details.EnumerateObject().Any(), "details should contain at least one field error entry");
  }

  [Fact]
  public async Task UnknownNotification_ReturnsPlainString404()
  {
    var email = DemoEmail("notif-404");
    await CreatePatientUserAsync(email);
    var token = await GetAccessTokenAsync(email);

    using var client = AuthenticatedClient(token);
    var response = await client.PutAsync($"/api/Notifications/{Guid.NewGuid()}/read", content: null);

    Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    // NotFound("Notification not found") does NOT go through the JSON formatter —
    // StringOutputFormatter writes the bare string as text/plain. So the body is the
    // raw unquoted text "Notification not found": not a JSON string, not an error
    // object. Frozen current behavior.
    var raw = await response.Content.ReadAsStringAsync();
    Assert.Equal("Notification not found", raw);
  }

  [Fact]
  public async Task RecommendationWithoutPreferences_Returns409MessageObject()
  {
    // CreatePatientUserAsync seeds NO preferences -> /me conflicts.
    var email = DemoEmail("rec-409");
    await CreatePatientUserAsync(email);
    var token = await GetAccessTokenAsync(email);

    using var client = AuthenticatedClient(token);
    var response = await client.GetAsync("/api/Recommendation/me");

    Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
    var body = await GetJsonUncheckedAsync(response);
    Assert.Equal(JsonValueKind.Object, body.ValueKind);
    AssertHasFields(body, "message");
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));
  }

  [Fact]
  public async Task RefreshWithGarbageAccessToken_ReturnsErrorCodeShape()
  {
    var response = await Client.PostAsJsonAsync("/api/Auth/refresh", new { refreshToken = "junk", accessToken = "junk" });

    Assert.InRange((int)response.StatusCode, 400, 499);
    var body = await GetJsonUncheckedAsync(response);
    AssertHasFields(body, "code", "message");
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("code").GetString()));
    // Currently InvalidAccessToken ("Access token could not be validated."), but any
    // token-validation error code from the refresh pipeline is accepted here.
    Assert.Contains(body.GetProperty("code").GetString(), new[]
    {
      "TokenValidationFailed", "InvalidAccessToken", "InvalidUserIdentifier", "UserNotFound", "RefreshTokenExpired"
    });
  }

  [Fact]
  public async Task UnauthorizedRequest_ReturnsEmpty401()
  {
    var email = DemoEmail("unauth-401");
    await CreatePatientUserAsync(email);

    // No Authorization header -> JwtBearer challenge.
    var response = await Client.GetAsync("/api/Sessions/me");

    Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    var raw = await response.Content.ReadAsStringAsync();
    Assert.Equal(string.Empty, raw);
  }
}
