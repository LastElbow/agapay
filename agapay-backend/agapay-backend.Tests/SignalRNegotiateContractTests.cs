using System.Net;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;

namespace agapay_backend.Tests;

/// <summary>
/// SignalR negotiate contract tests. The RN app connects with
/// skipNegotiation + WebSockets and appends ?access_token= via an
/// accessTokenFactory — negotiate-over-HTTP is what the server auth map gates.
/// The JWT OnMessageReceived map (AgapayServiceCollectionExtensions.cs) covers
/// only 5 of the 7 hub paths; header-based Bearer auth works on every [Authorize] hub.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so they
/// can safely share the class's InMemory database.
/// </summary>
public class SignalRNegotiateContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public SignalRNegotiateContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  /// <summary>Hub paths whose negotiate accepts ?access_token= (the RN transport path).</summary>
  private static readonly string[] QueryTokenMappedHubs =
  {
    "/hubs/chat", "/hubs/sessions", "/hubs/contracts", "/locationhub"
  };

  [Fact]
  public async Task Negotiate_WithBearerHeader_AcceptedOnMappedHubs()
  {
    var email = DemoEmail("sig-bearer");
    await CreateTherapistUserAsync(email);
    var token = await GetAccessTokenAsync(email);

    using var client = Factory.CreateClient();
    client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

    foreach (var hub in QueryTokenMappedHubs)
    {
      var response = await client.PostAsync($"{hub}/negotiate?negotiateVersion=1", content: null);
      Assert.Equal(HttpStatusCode.OK, response.StatusCode);
      var body = await GetJsonAsync(response);
      AssertHasFields(body, "connectionToken");
      Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("connectionToken").GetString()),
        $"{hub} negotiate returned an empty connectionToken");
    }
  }

  [Fact]
  public async Task Negotiate_WithAccessTokenQuery_AcceptedOnMappedHubs()
  {
    var email = DemoEmail("sig-query");
    await CreateTherapistUserAsync(email);
    var token = await GetAccessTokenAsync(email);

    using var client = Factory.CreateClient(); // NO Authorization header — query token only

    foreach (var hub in QueryTokenMappedHubs)
    {
      var response = await client.PostAsync($"{hub}/negotiate?negotiateVersion=1&access_token={token}", content: null);
      Assert.Equal(HttpStatusCode.OK, response.StatusCode);
      var body = await GetJsonAsync(response);
      AssertHasFields(body, "connectionToken");
    }
  }

  // FROZEN CURRENT PARITY: the JWT query map deliberately omits /hubs/notifications
  // and /hubs/ratings, so the RN app's ?access_token= transport path cannot negotiate
  // on them (401). Bearer-header auth is path-independent and still works (200).
  // This test documents both halves of that behavior — do NOT "fix" one side here.
  [Fact]
  public async Task Negotiate_NotificationsAndRatings_QueryTokenRejected_CurrentParity()
  {
    var email = DemoEmail("sig-parity");
    await CreateTherapistUserAsync(email);
    var token = await GetAccessTokenAsync(email);

    using var headerClient = Factory.CreateClient();
    headerClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
    using var queryClient = Factory.CreateClient();

    foreach (var hub in new[] { "/hubs/notifications", "/hubs/ratings" })
    {
      var withHeader = await headerClient.PostAsync($"{hub}/negotiate?negotiateVersion=1", content: null);
      Assert.Equal(HttpStatusCode.OK, withHeader.StatusCode);

      var withQuery = await queryClient.PostAsync($"{hub}/negotiate?negotiateVersion=1&access_token={token}", content: null);
      Assert.Equal(HttpStatusCode.Unauthorized, withQuery.StatusCode);
    }
  }

  [Fact]
  public async Task Negotiate_Colleagues_RequiresTherapistRole()
  {
    var patientEmail = DemoEmail("sig-patient");
    await CreatePatientUserAsync(patientEmail);
    var patientToken = await GetAccessTokenAsync(patientEmail);

    var therapistEmail = DemoEmail("sig-colleague");
    await CreateTherapistUserAsync(therapistEmail);
    var therapistToken = await GetAccessTokenAsync(therapistEmail);

    // [Authorize(Roles = "PhysicalTherapist")]: patient token authenticates but fails the role check.
    using var patientClient = Factory.CreateClient();
    var patientResponse = await patientClient.PostAsync(
      $"/hubs/colleagues/negotiate?negotiateVersion=1&access_token={patientToken}", content: null);
    Assert.Equal(HttpStatusCode.Forbidden, patientResponse.StatusCode);

    using var therapistClient = Factory.CreateClient();
    var therapistResponse = await therapistClient.PostAsync(
      $"/hubs/colleagues/negotiate?negotiateVersion=1&access_token={therapistToken}", content: null);
    Assert.Equal(HttpStatusCode.OK, therapistResponse.StatusCode);
    var body = await GetJsonAsync(therapistResponse);
    AssertHasFields(body, "connectionToken");
  }
}
