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
/// Wire-shape contract tests for the Sessions endpoints the mobile app parses
/// (see TESTING.md). Freezes the exact camelCase field names of the raw JSON —
/// the 30-field summary shape (me/upcoming + me), the 57-field detail shape,
/// and the mutation response shapes — plus the DB state transitions behind them.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class SessionContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public SessionContractTests(AuthApiFactory sharedFactory)
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

  // ---- 30-field summary shape shared by /me/upcoming and /me ----
  private static readonly string[] SummaryFields =
  {
    "id", "contractId", "patientId", "patientName", "physicalTherapistId", "therapistName",
    "therapistProfilePictureUrl", "startAt", "endAt", "durationMinutes", "status", "contractStatus",
    "conditionCase", "locationAddress", "latitude", "longitude", "totalFee", "patientFee",
    "professionalFee", "locationFee", "miscellaneousFee", "isRescheduled", "rescheduledAt",
    "proposedRescheduleStartAt", "proposedRescheduleEndAt", "rescheduleProposalReason",
    "rescheduleProposedAt", "relieverTherapistId", "relieverSubstitutionReason", "isRelieverProposed"
  };

  // ---- 57-field detail shape returned by GET /api/Sessions/{id} ----
  private static readonly string[] DetailFields =
  {
    "id", "patientId", "patientName", "physicalTherapistId", "therapistName", "therapistLicenseNo",
    "isRelieverSession", "originalTherapistId", "contractId", "contractStatus", "contractEndDate",
    "contractEndReason", "contractEndedAt", "startAt", "endAt", "durationMinutes", "locationAddress",
    "latitude", "longitude", "patientAddress", "patientBarangay", "patientLatitude", "patientLongitude",
    "effectiveAddress", "effectiveLatitude", "effectiveLongitude", "doctorReferralImageUrl", "totalFee",
    "patientFee", "conditionCase", "professionalFee", "locationFee", "miscellaneousFee", "status",
    "cancellationReason", "cancelledBy", "patientCancellationReason", "cancellationRequestedAt",
    "isPendingCancellation", "isCancellationAcknowledged", "createdAt", "detailsProposedAt",
    "detailsConfirmedAt", "isAwaitingPatientConfirmation", "hasBeenRatedByPatient",
    "hasBeenRatedByTherapist", "isRescheduled", "rescheduledAt", "proposedRescheduleStartAt",
    "proposedRescheduleEndAt", "rescheduleProposalReason", "rescheduleProposedAt", "relieverTherapistId",
    "relieverTherapistName", "relieverTherapistSpecialty", "relieverSubstitutionReason", "isRelieverProposed"
  };

  private sealed record SessionSeed(
    User PatientUser, User TherapistUser, Contract Contract, TherapySession Session);

  /// <summary>
  /// Seeds patient + verified therapist + one Active contract (fees per the app's
  /// default blueprint) + one Scheduled session 10 days out. Returns the saved
  /// entities so tests can use the generated int PKs.
  /// </summary>
  private async Task<SessionSeed> SeedSessionAsync()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("sess-patient"));
    var therapistUser = await CreateTherapistUserAsync(DemoEmail("sess-therapist"));
    var patient = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == therapistUser.Id);

    var contract = new Contract
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      StartDate = DateTime.UtcNow,
      EndDate = DateTime.UtcNow.AddDays(30),
      Status = ContractStatus.Active,
      TotalFee = 1500,
      ProfessionalFee = 1200,
      LocationFee = 200,
      MiscellaneousFee = 100,
      CaseToTreat = "Test case",
    };
    Db.Contracts.Add(contract);

    var session = new TherapySession
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      ContractId = contract.Id,
      StartAt = DateTime.UtcNow.AddDays(10),
      EndAt = DateTime.UtcNow.AddDays(10).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1500,
      PatientFee = 1500,
      ConditionCase = "Test case",
    };
    Db.TherapySessions.Add(session);
    await Db.SaveChangesAsync();

    return new SessionSeed(patientUser, therapistUser, contract, session);
  }

  private async Task<HttpClient> TherapistClientForAsync(User therapistUser)
  {
    var token = await GetAccessTokenAsync(therapistUser.Email!);
    return AuthenticatedClient(token);
  }

  private async Task<HttpClient> PatientClientForAsync(User patientUser)
  {
    var token = await GetAccessTokenAsync(patientUser.Email!);
    return AuthenticatedClient(token);
  }

  [Fact]
  public async Task Upcoming_Returns30FieldSummaryShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    var response = await therapist.GetAsync("/api/Sessions/me/upcoming?take=5");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Contains(body.EnumerateArray(), item => item.GetProperty("id").GetInt32() == seed.Session.Id);
    AssertFieldsOnEveryItem(body, SummaryFields);

    var ours = body.EnumerateArray().Single(i => i.GetProperty("id").GetInt32() == seed.Session.Id);
    Assert.Equal("Scheduled", ours.GetProperty("status").GetString());
    Assert.Equal("Active", ours.GetProperty("contractStatus").GetString());
    Assert.Equal(60, ours.GetProperty("durationMinutes").GetInt32());
    Assert.False(string.IsNullOrWhiteSpace(ours.GetProperty("patientName").GetString()));
    Assert.False(string.IsNullOrWhiteSpace(ours.GetProperty("therapistName").GetString()));
  }

  [Fact]
  public async Task Me_ReturnsSameShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    var response = await therapist.GetAsync("/api/Sessions/me");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Contains(body.EnumerateArray(), item => item.GetProperty("id").GetInt32() == seed.Session.Id);
    AssertFieldsOnEveryItem(body, SummaryFields);

    var ours = body.EnumerateArray().Single(i => i.GetProperty("id").GetInt32() == seed.Session.Id);
    Assert.Equal("Scheduled", ours.GetProperty("status").GetString());
  }

  [Fact]
  public async Task Detail_Returns57FieldShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    var response = await therapist.GetAsync($"/api/Sessions/{seed.Session.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, DetailFields);

    Assert.Equal(seed.Session.Id, body.GetProperty("id").GetInt32());
    Assert.Equal("Scheduled", body.GetProperty("status").GetString());
    Assert.Equal("Active", body.GetProperty("contractStatus").GetString());
    Assert.False(body.GetProperty("isRelieverSession").GetBoolean());
    Assert.False(body.GetProperty("isPendingCancellation").GetBoolean());
    Assert.False(body.GetProperty("isAwaitingPatientConfirmation").GetBoolean());
    Assert.False(body.GetProperty("hasBeenRatedByPatient").GetBoolean());
    Assert.False(body.GetProperty("hasBeenRatedByTherapist").GetBoolean());
  }

  [Fact]
  public async Task Create_WithPascalCaseBody_ReturnsId()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    // PascalCase body on purpose: the app sends PascalCase and ASP.NET Core model
    // binding is case-insensitive — freeze that this keeps working. Placed on a
    // free slot (day 11) so it does not overlap the seeded day-10 session.
    var response = await therapist.PostAsJsonAsync("/api/Sessions", new
    {
      TherapistId = seed.Contract.PhysicalTherapistId,
      ContractId = seed.Contract.Id,
      StartAt = DateTime.UtcNow.AddDays(11),
      EndAt = DateTime.UtcNow.AddDays(11).AddHours(1),
      LocationAddress = "Test",
      Latitude = 14.6,
      Longitude = 120.98,
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "id");
    var createdId = body.GetProperty("id").GetInt32();
    Assert.True(createdId > 0);

    // The created session must show up in the therapist's upcoming list.
    var upcoming = await therapist.GetAsync("/api/Sessions/me/upcoming?take=50");
    Assert.Equal(HttpStatusCode.OK, upcoming.StatusCode);
    var list = await GetJsonAsync(upcoming);
    Assert.Contains(list.EnumerateArray(), item => item.GetProperty("id").GetInt32() == createdId);
  }

  [Fact]
  public async Task Cancel_ReturnsMessageShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    var response = await therapist.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/cancel", new { reason = "test" });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message");
    Assert.Equal("Session cancelled", body.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.Equal(SessionStatus.Cancelled, reloaded.Status);
      Assert.Equal(CancellationInitiator.Therapist, reloaded.CancelledBy);
    }
  }

  [Fact]
  public async Task Cancel_WithRescheduleProposal_ReturnsProposalMessage()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    // Therapist cancel WITH a reschedule proposal routes to patient approval
    // (PendingRescheduleApproval), not an outright cancellation.
    var response = await therapist.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/cancel", new
    {
      reason = "r",
      proposedRescheduleStartAt = DateTime.UtcNow.AddDays(14),
      proposedRescheduleEndAt = DateTime.UtcNow.AddDays(14).AddHours(1),
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message");
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("message").GetString()));
    Assert.Equal("Reschedule proposal sent to patient", body.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.Equal(SessionStatus.PendingRescheduleApproval, reloaded.Status);
      Assert.NotNull(reloaded.ProposedRescheduleStartAt);
      Assert.NotNull(reloaded.ProposedRescheduleEndAt);
      Assert.Equal("r", reloaded.RescheduleProposalReason);
      Assert.NotNull(reloaded.RescheduleProposedAt);
    }
  }

  [Fact]
  public async Task RequestAndAcknowledgeCancellation_RolesAndShapes()
  {
    var seed = await SeedSessionAsync();
    using var patient = await PatientClientForAsync(seed.PatientUser);
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    // Patient requests cancellation -> PendingCancellation.
    var request = await patient.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/request-cancellation", new { reason = "feel better" });
    Assert.Equal(HttpStatusCode.OK, request.StatusCode);
    var requestBody = await GetJsonAsync(request);
    AssertHasFields(requestBody, "message");
    Assert.Equal("Cancellation request submitted", requestBody.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var afterRequest = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.Equal(SessionStatus.PendingCancellation, afterRequest.Status);
      Assert.Equal("feel better", afterRequest.PatientCancellationReason);
    }

    // Therapist acknowledges WITH a reschedule proposal -> PendingRescheduleApproval.
    var acknowledge = await therapist.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/acknowledge-cancellation", new
    {
      rescheduleStartAt = DateTime.UtcNow.AddDays(14).ToString("O"),
      rescheduleEndAt = DateTime.UtcNow.AddDays(14).AddHours(1).ToString("O"),
    });
    Assert.Equal(HttpStatusCode.OK, acknowledge.StatusCode);
    var acknowledgeBody = await GetJsonAsync(acknowledge);
    AssertHasFields(acknowledgeBody, "message");
    Assert.Equal("Reschedule proposal sent to patient", acknowledgeBody.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var afterAcknowledge = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.Equal(SessionStatus.PendingRescheduleApproval, afterAcknowledge.Status);
      Assert.NotNull(afterAcknowledge.ProposedRescheduleStartAt);
      Assert.Equal("feel better", afterAcknowledge.RescheduleProposalReason);
    }
  }

  [Fact]
  public async Task Reschedule_ReturnsNewTimesShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    // Reschedule only accepts Cancelled / CancellationAcknowledged sessions.
    var cancel = await therapist.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/cancel", new { reason = "test" });
    Assert.Equal(HttpStatusCode.OK, cancel.StatusCode);

    // The new slot must fall inside the therapist's weekly availability
    // (checked in Manila local time) — open the whole week.
    var therapistId = seed.Contract.PhysicalTherapistId;
    foreach (DayOfWeekEnum day in Enum.GetValues(typeof(DayOfWeekEnum)))
    {
      Db.TherapistAvailabilities.Add(new TherapistAvailability
      {
        PhysicalTherapistId = therapistId,
        DayOfWeek = day,
        StartTime = new TimeOnly(0, 0),
        EndTime = new TimeOnly(23, 59),
        IsAvailable = true,
      });
    }
    await Db.SaveChangesAsync();

    var newStart = DateTime.UtcNow.AddDays(12);
    var newEnd = DateTime.UtcNow.AddDays(12).AddHours(1);
    var response = await therapist.PutAsJsonAsync($"/api/Sessions/{seed.Session.Id}/reschedule", new
    {
      NewStartAt = newStart,
      NewEndAt = newEnd,
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message", "sessionId", "newStartAt", "newEndAt", "status");
    Assert.Equal(seed.Session.Id, body.GetProperty("sessionId").GetInt32());
    Assert.Equal("Scheduled", body.GetProperty("status").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.True(reloaded.IsRescheduled);
      Assert.Null(reloaded.CancellationReason);
      Assert.Null(reloaded.CancelledBy);
    }
  }

  [Fact]
  public async Task ApproveReschedule_ReturnsDecisionShape()
  {
    // Seed the session directly in the PendingRescheduleApproval state that
    // ApproveRescheduleAsync requires (what CancelAsync-with-proposal produces).
    var patientUser = await CreatePatientUserAsync(DemoEmail("sess-approve-patient"));
    var therapistUser = await CreateTherapistUserAsync(DemoEmail("sess-approve-therapist"));
    var patient = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == therapistUser.Id);

    var proposedStart = DateTime.UtcNow.AddDays(2);
    var proposedEnd = DateTime.UtcNow.AddDays(2).AddHours(1);

    var contract = new Contract
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      StartDate = DateTime.UtcNow,
      Status = ContractStatus.Active,
    };
    Db.Contracts.Add(contract);

    var session = new TherapySession
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      ContractId = contract.Id,
      StartAt = DateTime.UtcNow.AddDays(1),
      EndAt = DateTime.UtcNow.AddDays(1).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      RescheduleProposalReason = "Therapist unavailable",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      TotalFee = 1500,
      PatientFee = 1500,
    };
    Db.TherapySessions.Add(session);
    await Db.SaveChangesAsync();

    using var patientClient = await PatientClientForAsync(patientUser);
    var response = await patientClient.PutAsJsonAsync($"/api/Sessions/{session.Id}/approve-reschedule", new { });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message", "newStartAt", "newEndAt", "relieverApplied", "newTherapistName");
    Assert.Equal("Reschedule approved successfully", body.GetProperty("message").GetString());
    Assert.False(body.GetProperty("relieverApplied").GetBoolean());
    Assert.Equal(JsonValueKind.Null, body.GetProperty("newTherapistName").ValueKind);
    Assert.Equal(proposedStart, body.GetProperty("newStartAt").GetDateTime());
    Assert.Equal(proposedEnd, body.GetProperty("newEndAt").GetDateTime());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.TherapySessions.SingleAsync(s => s.Id == session.Id);
      Assert.Equal(SessionStatus.Scheduled, reloaded.Status);
      Assert.True(reloaded.IsRescheduled);
      Assert.Equal(proposedStart, reloaded.StartAt);
      Assert.Null(reloaded.ProposedRescheduleStartAt);
    }
  }

  [Fact]
  public async Task RelieverProposals_ReturnsProposalShape()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("sess-reliever-patient"));
    var therapistUser = await CreateTherapistUserAsync(DemoEmail("sess-reliever-orig"));
    var relieverUser = await CreateTherapistUserAsync(DemoEmail("sess-reliever-rel"));
    var patient = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == therapistUser.Id);
    var reliever = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == relieverUser.Id);

    var contract = new Contract
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      StartDate = DateTime.UtcNow,
      Status = ContractStatus.Active,
    };
    Db.Contracts.Add(contract);

    var session = new TherapySession
    {
      PatientId = patient.Id,
      PhysicalTherapistId = therapist.Id,
      ContractId = contract.Id,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRelieverAcceptance,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(6),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(6).AddHours(1),
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      IsRelieverProposed = true,
      RelieverTherapistId = reliever.Id,
      RelieverSubstitutionReason = "Cover needed",
      TotalFee = 1500,
      PatientFee = 1500,
      ConditionCase = "Test case",
    };
    Db.TherapySessions.Add(session);
    await Db.SaveChangesAsync();

    // The RELIEVER (not the original therapist) fetches the proposal list.
    using var relieverClient = await TherapistClientForAsync(relieverUser);
    var response = await relieverClient.GetAsync("/api/Sessions/reliever-proposals");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    AssertFieldsOnEveryItem(body,
      "id", "contractId", "patientId", "patientName", "originalTherapistId", "originalTherapistName",
      "proposedRescheduleStartAt", "proposedRescheduleEndAt", "rescheduleProposalReason",
      "relieverSubstitutionReason", "rescheduleProposedAt", "locationAddress", "conditionCase",
      "totalFee", "status");

    var ours = body.EnumerateArray().Single(i => i.GetProperty("id").GetInt32() == session.Id);
    Assert.Equal("PendingRelieverAcceptance", ours.GetProperty("status").GetString());
    Assert.Equal(therapist.Id, ours.GetProperty("originalTherapistId").GetInt32());
    Assert.Equal("Cover needed", ours.GetProperty("relieverSubstitutionReason").GetString());
  }

  [Fact]
  public async Task Logs_ReturnsSessionLogShape()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    // NOTE: LogTodayBindingModel binds StartTime/EndTime as DateTime — ISO strings
    // (the app sends ISO); bare "HH:mm" strings fail System.Text.Json model binding.
    var logResponse = await therapist.PostAsJsonAsync($"/api/Sessions/{seed.Session.Id}/log-today", new
    {
      startTime = DateTime.UtcNow,
      endTime = DateTime.UtcNow.AddHours(1),
    });
    Assert.Equal(HttpStatusCode.OK, logResponse.StatusCode);
    var logBody = await GetJsonAsync(logResponse);
    AssertHasFields(logBody, "id", "startTime", "endTime", "date", "durationMinutes");

    var response = await therapist.GetAsync($"/api/Sessions/{seed.Session.Id}/logs");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Single(body.EnumerateArray());
    AssertFieldsOnEveryItem(body, "id", "startTime", "endTime", "date", "durationMinutes");

    var log = body.EnumerateArray().First();
    // ACTUAL SHAPE: durationMinutes is a JSON number (double), not an integer —
    // it is computed as (EndTime - StartTime).TotalMinutes so DateTime round-trip
    // precision makes e.g. "60.00000000166666".
    Assert.True(Math.Abs(log.GetProperty("durationMinutes").GetDouble() - 60) < 0.01,
      $"durationMinutes should be ~60 but was {log.GetProperty("durationMinutes").GetRawText()}");
  }

  [Fact]
  public async Task MarkAsDone_Succeeds()
  {
    var seed = await SeedSessionAsync();
    using var therapist = await TherapistClientForAsync(seed.TherapistUser);

    var response = await therapist.PutAsync($"/api/Sessions/{seed.Session.Id}/mark-as-done", content: null);

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);

    using (var verify = FreshDb())
    {
      var reloaded = await verify.TherapySessions.SingleAsync(s => s.Id == seed.Session.Id);
      Assert.Equal(SessionStatus.DoneForToday, reloaded.Status);
    }
  }

  [Fact]
  public async Task ServerTime_IsAnonymous()
  {
    // No Authorization header — the endpoint must stay [AllowAnonymous].
    var response = await Client.GetAsync("/api/Sessions/server-time");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "serverTimeMs");
    Assert.True(body.GetProperty("serverTimeMs").GetInt64() > 0);
  }
}
