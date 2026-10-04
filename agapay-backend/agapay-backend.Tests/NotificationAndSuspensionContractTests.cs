using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

/// <summary>
/// Wire-shape contract tests for the notification endpoints and the suspension
/// moderation flow (see TESTING.md): the notification list/count/mark-read shapes,
/// the exact 403 { error, message, suspensionDetails } bodies from
/// SuspensionCheckMiddleware, the allow-listed endpoints that keep working while
/// suspended, and the admin warn/suspend/ban/restore response shapes.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class NotificationAndSuspensionContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public NotificationAndSuspensionContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  /// <summary>
  /// Fresh short-lived context over the factory's InMemory store. The long-lived
  /// <see cref="ContractTestBase.Db"/> scope tracks the seeded entities, so state
  /// written by HTTP requests would be shadowed by its identity map — use this
  /// for every DB assertion made AFTER an HTTP call.
  /// </summary>
  private agapayDbContext FreshDb()
    => new(Factory.Services.GetRequiredService<DbContextOptions<agapayDbContext>>());

  private async Task<HttpClient> ClientForAsync(User user)
  {
    var token = await GetAccessTokenAsync(user.Email!);
    return AuthenticatedClient(token);
  }

  /// <summary>
  /// Admins can only log in through the generic /api/Auth/login endpoint:
  /// login/patient and login/therapist reject non-members with a RoleMismatch 403.
  /// The generic login has no OTP challenge path, so demo accounts get tokens directly.
  /// </summary>
  private async Task<HttpClient> AdminClientAsync(User admin)
  {
    var response = await Client.PostAsJsonAsync("/api/Auth/login", new { email = admin.Email!, password = "Password123!" });
    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
    var token = doc.RootElement.GetProperty("accessToken").GetString()
      ?? throw new InvalidOperationException("Admin login response had no accessToken");
    return AuthenticatedClient(token);
  }

  private async Task<Notification> SeedNotificationAsync(User recipient, bool isRead, int minutesAgo)
  {
    var notification = new Notification
    {
      UserId = recipient.Id,
      Type = "info",
      Title = "Seeded notification",
      Message = $"body-{Guid.NewGuid():N}",
      IsRead = isRead,
      CreatedAt = DateTime.UtcNow.AddMinutes(-minutesAgo),
      ReadAt = isRead ? DateTime.UtcNow.AddMinutes(-minutesAgo + 0.5) : null,
    };
    Db.Notifications.Add(notification);
    await Db.SaveChangesAsync();
    return notification;
  }

  [Fact]
  public async Task List_ReturnsNotificationShape()
  {
    var user = await CreatePatientUserAsync(DemoEmail("notif-list"));
    var oldest = await SeedNotificationAsync(user, isRead: true, minutesAgo: 30);
    var middle = await SeedNotificationAsync(user, isRead: false, minutesAgo: 20);
    var newest = await SeedNotificationAsync(user, isRead: false, minutesAgo: 10);

    using var client = await ClientForAsync(user);

    var response = await client.GetAsync("/api/Notifications");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Equal(3, body.GetArrayLength());
    AssertFieldsOnEveryItem(body, "id", "type", "title", "message", "isRead", "createdAt", "readAt");

    // Newest first. Unread rows serialize readAt as an explicit JSON null.
    Assert.Equal(newest.Id, body[0].GetProperty("id").GetGuid());
    Assert.False(body[0].GetProperty("isRead").GetBoolean());
    Assert.Equal(JsonValueKind.Null, body[0].GetProperty("readAt").ValueKind);
    Assert.Equal(middle.Id, body[1].GetProperty("id").GetGuid());
    Assert.Equal(oldest.Id, body[2].GetProperty("id").GetGuid());
    Assert.True(body[2].GetProperty("isRead").GetBoolean());
    Assert.Equal(JsonValueKind.String, body[2].GetProperty("readAt").ValueKind);

    // unreadOnly=true filters to just the unread rows (newest first again).
    var unread = await client.GetAsync("/api/Notifications?unreadOnly=true");
    Assert.Equal(HttpStatusCode.OK, unread.StatusCode);
    var unreadBody = await GetJsonAsync(unread);
    Assert.Equal(2, unreadBody.GetArrayLength());
    AssertFieldsOnEveryItem(unreadBody, "id", "type", "title", "message", "isRead", "createdAt", "readAt");
    var unreadIds = unreadBody.EnumerateArray().Select(n => n.GetProperty("id").GetGuid()).ToList();
    Assert.DoesNotContain(oldest.Id, unreadIds);
    Assert.Contains(middle.Id, unreadIds);
    Assert.Contains(newest.Id, unreadIds);
  }

  [Fact]
  public async Task UnreadCount_ReturnsCount()
  {
    var user = await CreatePatientUserAsync(DemoEmail("notif-count"));
    await SeedNotificationAsync(user, isRead: true, minutesAgo: 30);
    await SeedNotificationAsync(user, isRead: false, minutesAgo: 20);
    await SeedNotificationAsync(user, isRead: false, minutesAgo: 10);

    using var client = await ClientForAsync(user);

    var response = await client.GetAsync("/api/Notifications/unread-count");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "unreadCount");
    Assert.Equal(2, body.GetProperty("unreadCount").GetInt32());
  }

  [Fact]
  public async Task MarkRead_ReturnsMessageShape()
  {
    var user = await CreatePatientUserAsync(DemoEmail("notif-markread"));
    var first = await SeedNotificationAsync(user, isRead: false, minutesAgo: 20);
    var second = await SeedNotificationAsync(user, isRead: false, minutesAgo: 10);

    using var client = await ClientForAsync(user);

    // Mark one: exact message shape, DB flip to read with a timestamp.
    var markOne = await client.PutAsync($"/api/Notifications/{first.Id}/read", content: null);
    Assert.Equal(HttpStatusCode.OK, markOne.StatusCode);
    var markOneBody = await GetJsonAsync(markOne);
    AssertHasFields(markOneBody, "message");
    Assert.Equal("Notification marked as read", markOneBody.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.Notifications.SingleAsync(n => n.Id == first.Id);
      Assert.True(reloaded.IsRead);
      Assert.NotNull(reloaded.ReadAt);
      var untouched = await verify.Notifications.SingleAsync(n => n.Id == second.Id);
      Assert.False(untouched.IsRead);
    }

    // Read-all: message embeds the count that was flipped.
    var readAll = await client.PutAsync("/api/Notifications/read-all", content: null);
    Assert.Equal(HttpStatusCode.OK, readAll.StatusCode);
    var readAllBody = await GetJsonAsync(readAll);
    AssertHasFields(readAllBody, "message");
    Assert.Equal("1 notifications marked as read", readAllBody.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      Assert.True(await verify.Notifications.Where(n => n.UserId == user.Id).AllAsync(n => n.IsRead));
    }
  }

  [Fact]
  public async Task SuspendedUser_GetExact403Shape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("notif-suspend-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("notif-suspend"));

    using var adminClient = await AdminClientAsync(admin);
    var suspend = await adminClient.PostAsJsonAsync($"/api/Admin/users/{patient.Id}/suspend", new
    {
      reason = "test violation",
      duration = "1day"
    });
    Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);
    var suspendBody = await GetJsonAsync(suspend);
    AssertHasFields(suspendBody, "message", "accountStatus", "suspendedUntil");
    Assert.Equal("Suspended", suspendBody.GetProperty("accountStatus").GetString());

    // Any non-allow-listed authenticated call gets the middleware's exact 403 body.
    using var patientClient = await ClientForAsync(patient);
    var blocked = await patientClient.GetAsync("/api/Sessions/me");

    Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
    var body = await GetJsonUncheckedAsync(blocked);
    AssertHasFields(body, "error", "message", "suspensionDetails");
    Assert.Equal("AccountSuspended", body.GetProperty("error").GetString());
    Assert.Equal("Your account is currently suspended.", body.GetProperty("message").GetString());

    var details = body.GetProperty("suspensionDetails");
    AssertHasFields(details, "reason", "suspendedAt", "suspendedUntil", "isPermanent");
    Assert.Equal("test violation", details.GetProperty("reason").GetString());
    Assert.Equal(JsonValueKind.String, details.GetProperty("suspendedAt").ValueKind);
    Assert.Equal(JsonValueKind.String, details.GetProperty("suspendedUntil").ValueKind); // 1day suspension -> real end date
    Assert.False(details.GetProperty("isPermanent").GetBoolean());
  }

  [Fact]
  public async Task BannedUser_GetExact403Shape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("notif-ban-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("notif-ban"));

    using var adminClient = await AdminClientAsync(admin);
    var ban = await adminClient.PostAsJsonAsync($"/api/Admin/users/{patient.Id}/ban", new { reason = "severe" });
    Assert.Equal(HttpStatusCode.OK, ban.StatusCode);
    var banBody = await GetJsonAsync(ban);
    AssertHasFields(banBody, "message", "accountStatus");
    Assert.Equal("Banned", banBody.GetProperty("accountStatus").GetString());

    using var patientClient = await ClientForAsync(patient);
    var blocked = await patientClient.GetAsync("/api/Sessions/me");

    Assert.Equal(HttpStatusCode.Forbidden, blocked.StatusCode);
    var body = await GetJsonUncheckedAsync(blocked);
    AssertHasFields(body, "error", "message", "suspensionDetails");
    Assert.Equal("AccountBanned", body.GetProperty("error").GetString());
    Assert.Equal("Your account has been permanently banned.", body.GetProperty("message").GetString());

    var details = body.GetProperty("suspensionDetails");
    AssertHasFields(details, "reason", "suspendedAt", "suspendedUntil", "isPermanent");
    Assert.Equal("severe", details.GetProperty("reason").GetString());
    Assert.Equal(JsonValueKind.Null, details.GetProperty("suspendedUntil").ValueKind); // ban = permanent, no end date
    Assert.True(details.GetProperty("isPermanent").GetBoolean());
  }

  [Fact]
  public async Task AllowListedEndpoints_WorkWhileSuspended()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("notif-allow-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("notif-allow"));

    // Capture PRE-suspension tokens: the refresh grant must keep working while suspended.
    var login = await Client.PostAsJsonAsync("/api/Auth/login/patient", new { email = patient.Email!, password = "Password123!" });
    Assert.Equal(HttpStatusCode.OK, login.StatusCode);
    using (var loginDoc = JsonDocument.Parse(await login.Content.ReadAsStringAsync()))
    {
      var accessToken = loginDoc.RootElement.GetProperty("accessToken").GetString()!;
      var refreshToken = loginDoc.RootElement.GetProperty("refreshToken").GetString()!;

      using var adminClient = await AdminClientAsync(admin);
      var suspend = await adminClient.PostAsJsonAsync($"/api/Admin/users/{patient.Id}/suspend", new
      {
        reason = "allowlist probe",
        duration = "7days"
      });
      Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);

      using var patientClient = AuthenticatedClient(accessToken);

      // DRIFT (frozen actual): the RN app (app/suspension.tsx, SuspensionContext.tsx)
      // calls "/api/users/suspension-status" (plural) — the controller's real route is
      // /api/User/suspension-status (singular, from [controller]), so the app-called
      // path 404s outright.
      var appCalledPath = await patientClient.GetAsync("/api/users/suspension-status");
      Assert.Equal(HttpStatusCode.NotFound, appCalledPath.StatusCode);

      // DRIFT (frozen actual): the middleware's allow-list also lists the PLURAL
      // "/api/users/suspension-status" — which never matches the REAL singular route
      // even case-insensitively ("user" != "users"). While suspended the status
      // endpoint is therefore BLOCKED like any other endpoint: 403 AccountSuspended.
      var status = await patientClient.GetAsync("/api/User/suspension-status");
      Assert.Equal(HttpStatusCode.Forbidden, status.StatusCode);
      var statusBody = await GetJsonUncheckedAsync(status);
      Assert.Equal("AccountSuspended", statusBody.GetProperty("error").GetString());
      Assert.Equal("Your account is currently suspended.", statusBody.GetProperty("message").GetString());
      var blockedDetails = statusBody.GetProperty("suspensionDetails");
      Assert.Equal("allowlist probe", blockedDetails.GetProperty("reason").GetString());

      // 2. Notifications remain readable (allow-listed prefix). Freezing real behavior:
      // suspending a user writes them a "suspension" notification, so that notice is
      // exactly what the suspended user reads here.
      var notifications = await patientClient.GetAsync("/api/Notifications");
      Assert.Equal(HttpStatusCode.OK, notifications.StatusCode);
      var notificationsBody = await GetJsonAsync(notifications);
      Assert.Equal(JsonValueKind.Array, notificationsBody.ValueKind);
      Assert.Equal(1, notificationsBody.GetArrayLength());
      Assert.Equal("suspension", notificationsBody[0].GetProperty("type").GetString());
      Assert.Equal("Account Suspended", notificationsBody[0].GetProperty("title").GetString());

      // 3. Token refresh remains available (allow-listed) so the app can stay signed in.
      var refresh = await Client.PostAsJsonAsync("/api/Auth/refresh", new { refreshToken, accessToken });
      Assert.Equal(HttpStatusCode.OK, refresh.StatusCode);
      var refreshBody = await GetJsonAsync(refresh);
      AssertHasFields(refreshBody, "accessToken", "refreshToken", "user", "homePath");
      Assert.False(string.IsNullOrWhiteSpace(refreshBody.GetProperty("accessToken").GetString()));
    }
  }

  [Fact]
  public async Task SuspensionStatus_ReturnsShape_ForActiveUser()
  {
    // The status endpoint only answers for NON-suspended users while suspended it is
    // itself blocked (see AllowListedEndpoints_WorkWhileSuspended) — so freeze its
    // wire shape in the reachable (active) state.
    var patient = await CreatePatientUserAsync(DemoEmail("notif-status-active"));
    using var patientClient = await ClientForAsync(patient);

    var response = await patientClient.GetAsync("/api/User/suspension-status");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "accountStatus", "isSuspended", "isBanned", "isActive", "suspensionDetails");
    Assert.Equal("Active", body.GetProperty("accountStatus").GetString());
    Assert.False(body.GetProperty("isSuspended").GetBoolean());
    Assert.False(body.GetProperty("isBanned").GetBoolean());
    Assert.True(body.GetProperty("isActive").GetBoolean());
    Assert.Equal(JsonValueKind.Null, body.GetProperty("suspensionDetails").ValueKind); // active -> explicit null
  }

  [Fact]
  public async Task Restore_ReturnsActiveStatus()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("notif-restore-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("notif-restore"));

    using var adminClient = await AdminClientAsync(admin);
    var suspend = await adminClient.PostAsJsonAsync($"/api/Admin/users/{patient.Id}/suspend", new
    {
      reason = "restore probe",
      duration = "7days"
    });
    Assert.Equal(HttpStatusCode.OK, suspend.StatusCode);

    var restore = await adminClient.PostAsync($"/api/Admin/users/{patient.Id}/restore", content: null);
    Assert.Equal(HttpStatusCode.OK, restore.StatusCode);
    var restoreBody = await GetJsonAsync(restore);
    AssertHasFields(restoreBody, "message", "accountStatus");
    Assert.Equal("User account restored successfully", restoreBody.GetProperty("message").GetString());
    Assert.Equal("Active", restoreBody.GetProperty("accountStatus").GetString());

    // The 403 suspension block must be gone.
    using var patientClient = await ClientForAsync(patient);
    var sessions = await patientClient.GetAsync("/api/Sessions/me");
    Assert.Equal(HttpStatusCode.OK, sessions.StatusCode);

    using (var verify = FreshDb())
    {
      var reloaded = await verify.Users.SingleAsync(u => u.Id == patient.Id);
      Assert.Equal("Active", reloaded.AccountStatus);
      Assert.Null(reloaded.SuspensionReason);
      Assert.Null(reloaded.SuspendedUntil);
    }
  }

  [Fact]
  public async Task Warn_ReturnsWarnShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("notif-warn-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("notif-warn"));

    using var adminClient = await AdminClientAsync(admin);
    var warn = await adminClient.PostAsJsonAsync($"/api/Admin/users/{patient.Id}/warn", new { reason = "behave" });

    Assert.Equal(HttpStatusCode.OK, warn.StatusCode);
    var body = await GetJsonAsync(warn);
    AssertHasFields(body, "message", "warningCount", "reason", "autoSuspended", "accountStatus");
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));
    Assert.Equal(1, body.GetProperty("warningCount").GetInt32());
    Assert.Equal("behave", body.GetProperty("reason").GetString());
    Assert.False(body.GetProperty("autoSuspended").GetBoolean());
    Assert.Equal("Active", body.GetProperty("accountStatus").GetString());

    // The warning creates a "warning" notification for the user.
    using (var verify = FreshDb())
    {
      var warning = await verify.Notifications.SingleAsync(n => n.UserId == patient.Id && n.Type == "warning");
      Assert.Contains("behave", warning.Message);
    }
  }
}
