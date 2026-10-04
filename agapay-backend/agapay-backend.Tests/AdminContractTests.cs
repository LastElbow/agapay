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
/// Wire-shape contract tests for the admin portal endpoints (see TESTING.md):
/// verification submissions list/detail/verify, report list/stats/status (the Admin
/// AND the different Moderation variant), user account details, the lowercase-route
/// condition curation CRUD, and the admin-only route guard.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class AdminContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public AdminContractTests(AuthApiFactory sharedFactory)
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

  /// <summary>
  /// Seeds a PENDING therapist submission (what the admin verification queue lists).
  /// No LicenseImageUrl on purpose: the Testing environment has no reachable Supabase,
  /// and the endpoints only touch storage when an image path is present.
  /// </summary>
  private async Task<(User User, PhysicalTherapist Therapist)> SeedPendingSubmissionAsync(string prefix)
  {
    var user = await CreateTherapistUserAsync(DemoEmail(prefix), verified: false);
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == user.Id);
    therapist.SubmittedAt = DateTime.UtcNow;
    await Db.SaveChangesAsync();
    return (user, therapist);
  }

  private async Task<Report> SeedReportAsync(User reporter, User reported, string category, string status = "New", string priority = "Medium")
  {
    var report = new Report
    {
      ReporterUserId = reporter.Id,
      ReportedUserId = reported.Id,
      Category = category,
      Notes = "seeded report notes",
      Status = status,
      Priority = priority,
      CreatedAt = DateTime.UtcNow,
    };
    Db.Reports.Add(report);
    await Db.SaveChangesAsync();
    return report;
  }

  [Fact]
  public async Task Submissions_ReturnsListShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-sub-admin"));
    var (user, therapist) = await SeedPendingSubmissionAsync("admin-sub");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.GetAsync("/api/Admin/submissions");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    AssertFieldsOnEveryItem(body, "id", "userId", "userName", "email", "licenseNumber", "submittedAt", "status");

    var mine = body.EnumerateArray().Single(i => i.GetProperty("id").GetInt32() == therapist.Id);
    Assert.Equal(user.Id.ToString(), mine.GetProperty("userId").GetString());
    Assert.Equal(user.Email, mine.GetProperty("email").GetString());
    Assert.Equal("Pending", mine.GetProperty("status").GetString());
    Assert.False(string.IsNullOrWhiteSpace(mine.GetProperty("userName").GetString()));

    // DRIFT (frozen actual): the admin portal ALSO reads licenseImagePath,
    // licensePreviewUrl and verificationStatus from this list payload, but the
    // backend only returns those on the detail endpoint — the list omits all three.
    var first = body[0];
    Assert.False(first.TryGetProperty("licenseImagePath", out _), "list items must NOT carry licenseImagePath (frozen actual)");
    Assert.False(first.TryGetProperty("licensePreviewUrl", out _), "list items must NOT carry licensePreviewUrl (frozen actual)");
    Assert.False(first.TryGetProperty("verificationStatus", out _), "list items must NOT carry verificationStatus (frozen actual)");
  }

  [Fact]
  public async Task SubmissionDetail_ReturnsShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-detail-admin"));
    var (user, therapist) = await SeedPendingSubmissionAsync("admin-detail");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.GetAsync($"/api/Admin/submissions/{therapist.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "userId", "userName", "email", "licenseNumber",
      "licenseImagePath", "licensePreviewUrl", "submittedAt", "verifiedAt", "rejectionReason", "status");
    Assert.Equal(therapist.Id, body.GetProperty("id").GetInt32());
    Assert.Equal(user.Email, body.GetProperty("email").GetString());
    Assert.Equal("Pending", body.GetProperty("status").GetString());

    // No image was submitted: path and preview serialize as explicit nulls.
    Assert.Equal(JsonValueKind.Null, body.GetProperty("licenseImagePath").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("licensePreviewUrl").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("verifiedAt").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("rejectionReason").ValueKind);
  }

  [Fact]
  public async Task VerifyTherapist_Approves()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-verify-admin"));
    var (user, therapist) = await SeedPendingSubmissionAsync("admin-verify");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.PostAsJsonAsync($"/api/Admin/therapist-verifications/{therapist.Id}/verify", new { isApproved = true });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message", "status", "licenseImageDeleted", "licenseDeleteError");
    Assert.Equal("Therapist Verified successfully", body.GetProperty("message").GetString());
    Assert.Equal("Verified", body.GetProperty("status").GetString());
    Assert.False(body.GetProperty("licenseImageDeleted").GetBoolean()); // no image submitted
    Assert.Equal(JsonValueKind.Null, body.GetProperty("licenseDeleteError").ValueKind);

    using (var verify = FreshDb())
    {
      var reloaded = await verify.PhysicalTherapists.SingleAsync(t => t.Id == therapist.Id);
      Assert.Equal(VerificationStatus.Verified, reloaded.VerificationStatus);
      Assert.NotNull(reloaded.VerifiedAt);
      Assert.Null(reloaded.RejectionReason);
    }
  }

  [Fact]
  public async Task Reports_ReturnsShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-reports-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("admin-reports-reporter"));
    var therapist = await CreateTherapistUserAsync(DemoEmail("admin-reports-reported"));
    var harassment = await SeedReportAsync(patient, therapist, "harassment");
    var spam = await SeedReportAsync(therapist, patient, "spam", priority: "High");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.GetAsync("/api/Admin/reports");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    AssertFieldsOnEveryItem(body,
      "id", "reporterUserId", "reporterName", "reporterEmail",
      "reportedUserId", "reportedName", "reportedEmail",
      "category", "notes", "status", "priority", "adminNotes", "resolutionSummary",
      "createdAt", "reviewedBy", "reviewedAt");

    var mine = body.EnumerateArray().Single(r => r.GetProperty("id").GetInt32() == harassment.Id);
    Assert.Equal(patient.Id.ToString(), mine.GetProperty("reporterUserId").GetString());
    Assert.Equal("Patient Test", mine.GetProperty("reporterName").GetString()); // FirstName + " " + LastName, no FullName trims
    Assert.Equal(patient.Email, mine.GetProperty("reporterEmail").GetString());
    Assert.Equal(therapist.Id.ToString(), mine.GetProperty("reportedUserId").GetString());
    Assert.Equal("Therapist Test", mine.GetProperty("reportedName").GetString());
    Assert.Equal("harassment", mine.GetProperty("category").GetString());
    Assert.Equal("New", mine.GetProperty("status").GetString());
    Assert.Equal("Medium", mine.GetProperty("priority").GetString());
    // Unset adminNotes/resolutionSummary are coalesced to "" (not null) in the list projection.
    Assert.Equal(string.Empty, mine.GetProperty("adminNotes").GetString());
    Assert.Equal(string.Empty, mine.GetProperty("resolutionSummary").GetString());
    Assert.Equal(JsonValueKind.Null, mine.GetProperty("reviewedBy").ValueKind);
    Assert.Equal(JsonValueKind.Null, mine.GetProperty("reviewedAt").ValueKind);

    var high = body.EnumerateArray().Single(r => r.GetProperty("id").GetInt32() == spam.Id);
    Assert.Equal("High", high.GetProperty("priority").GetString());
    Assert.Equal("spam", high.GetProperty("category").GetString());
  }

  [Fact]
  public async Task ReportStats_ReturnsShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-stats-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("admin-stats-reporter"));
    var therapist = await CreateTherapistUserAsync(DemoEmail("admin-stats-reported"));
    var markerCategory = $"statscheck-{Guid.NewGuid():N}";
    await SeedReportAsync(patient, therapist, markerCategory);
    await SeedReportAsync(patient, therapist, markerCategory, priority: "Critical");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.GetAsync("/api/Admin/reports/stats");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "totalReports", "newReports", "reviewingReports", "resolvedReports", "dismissedReports",
      "reportsThisWeek", "reportsThisMonth", "highPriorityCount", "criticalCount",
      "averageResolutionTimeHours", "categoryBreakdown");
    Assert.True(body.GetProperty("totalReports").GetInt32() >= 2);
    Assert.True(body.GetProperty("newReports").GetInt32() >= 2);
    Assert.True(body.GetProperty("highPriorityCount").GetInt32() >= 1);
    Assert.True(body.GetProperty("criticalCount").GetInt32() >= 1);
    Assert.Equal(JsonValueKind.Number, body.GetProperty("averageResolutionTimeHours").ValueKind);

    // categoryBreakdown is an array of { category, count } — our marker category has exactly 2.
    var breakdown = body.GetProperty("categoryBreakdown");
    Assert.Equal(JsonValueKind.Array, breakdown.ValueKind);
    AssertFieldsOnEveryItem(breakdown, "category", "count");
    var mine = breakdown.EnumerateArray().Single(c => c.GetProperty("category").GetString() == markerCategory);
    Assert.Equal(2, mine.GetProperty("count").GetInt32());
  }

  [Fact]
  public async Task AdminReportStatus_ReturnsAdminShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-status-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("admin-status-reporter"));
    var therapist = await CreateTherapistUserAsync(DemoEmail("admin-status-reported"));
    var report = await SeedReportAsync(patient, therapist, "harassment");
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.PutAsJsonAsync($"/api/Admin/reports/{report.Id}/status", new
    {
      status = "Resolved",
      resolutionSummary = "done"
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message", "status", "resolutionSummary");
    Assert.Equal("Report status updated", body.GetProperty("message").GetString());
    Assert.Equal("Resolved", body.GetProperty("status").GetString());
    Assert.Equal("done", body.GetProperty("resolutionSummary").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.Reports.SingleAsync(r => r.Id == report.Id);
      Assert.Equal("Resolved", reloaded.Status);
      Assert.Equal("done", reloaded.ResolutionSummary);
      Assert.Equal(admin.Id, reloaded.ReviewedBy);
      Assert.NotNull(reloaded.ReviewedAt);
    }
  }

  [Fact]
  public async Task ModerationReportStatus_ReturnsDifferentShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("mod-status-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("mod-status-reporter"));
    var therapist = await CreateTherapistUserAsync(DemoEmail("mod-status-reported"));
    var report = await SeedReportAsync(patient, therapist, "harassment");
    using var adminClient = await AdminClientAsync(admin);

    // The Moderation variant takes { status } only (no resolutionSummary field).
    var response = await adminClient.PostAsJsonAsync($"/api/Moderation/reports/{report.Id}/status", new { status = "Resolved" });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);

    // FROZEN: deliberately DIFFERENT from the Admin variant — echoes the report row
    // (id, status, reviewedBy, reviewedAt) with no message/resolutionSummary wrapper.
    AssertHasFields(body, "id", "status", "reviewedBy", "reviewedAt");
    Assert.Equal(report.Id, body.GetProperty("id").GetInt32());
    Assert.Equal("Resolved", body.GetProperty("status").GetString());
    Assert.Equal(admin.Id.ToString(), body.GetProperty("reviewedBy").GetString());
    Assert.Equal(JsonValueKind.String, body.GetProperty("reviewedAt").ValueKind);
    Assert.False(body.TryGetProperty("message", out _), "moderation variant must NOT carry message (unlike the Admin variant)");
    Assert.False(body.TryGetProperty("resolutionSummary", out _), "moderation variant must NOT carry resolutionSummary");
  }

  [Fact]
  public async Task UserDetails_ReturnsShape()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-userdetails-admin"));
    var patient = await CreatePatientUserAsync(DemoEmail("admin-userdetails"));
    using var adminClient = await AdminClientAsync(admin);

    var response = await adminClient.GetAsync($"/api/Admin/users/{patient.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "name", "email", "roles", "accountStatus", "suspensionReason", "suspendedAt",
      "suspendedUntil", "warningCount", "createdAt", "lockoutEnd", "lockoutEnabled");
    Assert.Equal(patient.Id.ToString(), body.GetProperty("id").GetString());
    Assert.Equal(patient.Email, body.GetProperty("email").GetString());
    Assert.Equal("Active", body.GetProperty("accountStatus").GetString());
    Assert.Equal(JsonValueKind.Array, body.GetProperty("roles").ValueKind);
    Assert.Contains("User", body.GetProperty("roles").EnumerateArray().Select(r => r.GetString()));
    Assert.Equal(0, body.GetProperty("warningCount").GetInt32());
    // Never-moderated user: nulls for the suspension trio.
    Assert.Equal(JsonValueKind.Null, body.GetProperty("suspensionReason").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("suspendedAt").ValueKind);
    Assert.Equal(JsonValueKind.Null, body.GetProperty("suspendedUntil").ValueKind);
  }

  [Fact]
  public async Task Conditions_LowercaseRoute_CRUD()
  {
    var admin = await CreateAdminUserAsync(DemoEmail("admin-cond-admin"));
    var therapist = await CreateTherapistUserAsync(DemoEmail("admin-cond-therapist"));
    var therapistRow = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == therapist.Id);
    var source = new OtherCondition { Name = $"merge-source-{Guid.NewGuid():N}" };
    var destination = new OtherCondition { Name = $"merge-dest-{Guid.NewGuid():N}" };
    var toUpdate = new OtherCondition { Name = $"update-me-{Guid.NewGuid():N}" };
    Db.OtherConditions.AddRange(source, destination, toUpdate);
    therapistRow.OtherConditions.Add(source); // one therapist uses the source so merge moves them
    await Db.SaveChangesAsync();
    using var adminClient = await AdminClientAsync(admin);

    // LIST: lowercase route, camelCase items with curation fields.
    var list = await adminClient.GetAsync("/api/admin/conditions");
    Assert.Equal(HttpStatusCode.OK, list.StatusCode);
    var listBody = await GetJsonAsync(list);
    Assert.Equal(JsonValueKind.Array, listBody.ValueKind);
    AssertFieldsOnEveryItem(listBody, "id", "name", "status", "createdAt", "updatedAt", "therapistCount");
    var sourceItem = listBody.EnumerateArray().Single(c => c.GetProperty("id").GetInt32() == source.Id);
    Assert.Equal("Pending", sourceItem.GetProperty("status").GetString());
    Assert.Equal(1, sourceItem.GetProperty("therapistCount").GetInt32());

    // UPDATE with a valid status (CurationStatus is only Pending|Verified).
    var update = await adminClient.PutAsJsonAsync($"/api/admin/conditions/{toUpdate.Id}", new { status = "Verified" });
    Assert.Equal(HttpStatusCode.OK, update.StatusCode);
    var updateBody = await GetJsonAsync(update);
    AssertHasFields(updateBody, "message", "condition");
    Assert.Equal("Condition updated successfully", updateBody.GetProperty("message").GetString());
    var updatedCondition = updateBody.GetProperty("condition");
    AssertHasFields(updatedCondition, "id", "name", "status", "createdAt", "updatedAt", "therapistCount");
    Assert.Equal("Verified", updatedCondition.GetProperty("status").GetString());

    // DRIFT (frozen actual): a "Hidden" status is NOT supported — CurationStatus only
    // has Pending|Verified, so the update is rejected with the exact message below.
    var hidden = await adminClient.PutAsJsonAsync($"/api/admin/conditions/{toUpdate.Id}", new { status = "Hidden" });
    Assert.Equal(HttpStatusCode.BadRequest, hidden.StatusCode);
    var hiddenBody = await GetJsonUncheckedAsync(hidden);
    AssertHasFields(hiddenBody, "message");
    Assert.Equal("Invalid status value", hiddenBody.GetProperty("message").GetString());

    // MERGE: source's therapist re-hangs off the destination, source row deleted.
    var merge = await adminClient.PostAsJsonAsync("/api/admin/conditions/merge", new
    {
      sourceConditionId = source.Id,
      destinationConditionId = destination.Id
    });
    Assert.Equal(HttpStatusCode.OK, merge.StatusCode);
    var mergeBody = await GetJsonAsync(merge);
    AssertHasFields(mergeBody, "message", "therapistsMoved");
    Assert.Contains("Successfully merged", mergeBody.GetProperty("message").GetString());
    Assert.Equal(1, mergeBody.GetProperty("therapistsMoved").GetInt32());

    using (var verify = FreshDb())
    {
      Assert.False(await verify.OtherConditions.AnyAsync(c => c.Id == source.Id));
      var movedTherapist = await verify.PhysicalTherapists
        .Include(t => t.OtherConditions)
        .SingleAsync(t => t.Id == therapistRow.Id);
      Assert.Contains(movedTherapist.OtherConditions, c => c.Id == destination.Id);
      Assert.DoesNotContain(movedTherapist.OtherConditions, c => c.Id == source.Id);
    }
  }

  [Fact]
  public async Task AdminRoutes_RejectNonAdmin()
  {
    var patient = await CreatePatientUserAsync(DemoEmail("admin-guard-patient"));
    using var patientClient = await ClientForAsync(patient);

    // Both admin surfaces 403 the patient token; the [Authorize(Roles = "Admin")]
    // failure path writes an EMPTY body (no error envelope).
    var submissions = await patientClient.GetAsync("/api/Admin/submissions");
    Assert.Equal(HttpStatusCode.Forbidden, submissions.StatusCode);
    Assert.True(string.IsNullOrWhiteSpace(await submissions.Content.ReadAsStringAsync()),
      "403 from role authorization must have an empty body");

    var conditions = await patientClient.GetAsync("/api/admin/conditions");
    Assert.Equal(HttpStatusCode.Forbidden, conditions.StatusCode);
    Assert.True(string.IsNullOrWhiteSpace(await conditions.Content.ReadAsStringAsync()),
      "403 from role authorization must have an empty body");
  }
}
