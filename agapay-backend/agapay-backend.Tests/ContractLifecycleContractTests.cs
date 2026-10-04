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
/// Wire-shape contract tests for the contract lifecycle endpoints the mobile app
/// parses (see TESTING.md): create, detail, blueprint -> confirm -> session
/// generation seam, end, patient-scoped listing (with its ownership fix), and the
/// /api/Contracts/sessions/{id}/start|complete session-control routes.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class ContractLifecycleContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public ContractLifecycleContractTests(AuthApiFactory sharedFactory)
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

  private sealed record UsersSeed(User PatientUser, User TherapistUser);

  private sealed record ContractSeed(User PatientUser, User TherapistUser, Contract Contract);

  private sealed record TwoClients(HttpClient Patient, HttpClient Therapist);

  private async Task<TwoClients> ClientsForAsync(ContractSeed seed)
  {
    var patientToken = await GetAccessTokenAsync(seed.PatientUser.Email!);
    var therapistToken = await GetAccessTokenAsync(seed.TherapistUser.Email!);
    return new TwoClients(AuthenticatedClient(patientToken), AuthenticatedClient(therapistToken));
  }

  /// <summary>Seeds patient + verified therapist (no contract).</summary>
  private async Task<UsersSeed> SeedUsersAsync(string prefix)
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail($"{prefix}-patient"));
    var therapistUser = await CreateTherapistUserAsync(DemoEmail($"{prefix}-therapist"));
    return new UsersSeed(patientUser, therapistUser);
  }

  /// <summary>Seeds patient + verified therapist + one Active contract with fees.</summary>
  private async Task<ContractSeed> SeedActiveContractAsync(string prefix)
  {
    var users = await SeedUsersAsync(prefix);
    var patient = await Db.Patients.SingleAsync(p => p.UserId == users.PatientUser.Id);
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == users.TherapistUser.Id);

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
    await Db.SaveChangesAsync();

    return new ContractSeed(users.PatientUser, users.TherapistUser, contract);
  }

  [Fact]
  public async Task Create_WithPascalCaseBody_ReturnsId()
  {
    // No pre-existing contract on purpose: a patient with an Active contract for
    // the same therapist short-circuits into the "existing" Ok branch.
    var users = await SeedUsersAsync("cl-create");
    var patientId = await Db.Patients.Where(p => p.UserId == users.PatientUser.Id).Select(p => p.Id).SingleAsync();
    var therapistId = await Db.PhysicalTherapists.Where(t => t.UserId == users.TherapistUser.Id).Select(t => t.Id).SingleAsync();

    var therapistToken = await GetAccessTokenAsync(users.TherapistUser.Email!);
    using var therapist = AuthenticatedClient(therapistToken);

    // PascalCase body on purpose: the app sends PascalCase and ASP.NET Core model
    // binding is case-insensitive — freeze that this keeps working.
    var response = await therapist.PostAsJsonAsync("/api/Contracts", new
    {
      PatientId = patientId,
      PhysicalTherapistId = therapistId,
      StartDate = DateTime.UtcNow,
      EndDate = DateTime.UtcNow.AddDays(30),
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    // The app reads `id ?? Id` — camelCase serialization emits "id" for the
    // anonymous `{ contract.Id }` payload.
    AssertHasFields(body, "id");
    var createdId = body.GetProperty("id").GetInt32();
    Assert.True(createdId > 0);

    // New contracts start as Draft until the blueprint is confirmed.
    using (var verify = FreshDb())
    {
      var reloaded = await verify.Contracts.SingleAsync(c => c.Id == createdId);
      Assert.Equal(ContractStatus.Draft, reloaded.Status);
    }
  }

  [Fact]
  public async Task Detail_ReturnsContractDetailShape()
  {
    var seed = await SeedActiveContractAsync("cl-detail");
    var clients = await ClientsForAsync(seed);
    using var therapist = clients.Therapist;

    var response = await therapist.GetAsync($"/api/Contracts/{seed.Contract.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "patientId", "physicalTherapistId", "startDate", "endDate", "status", "caseToTreat",
      "sessionDays", "sessionStartTime", "sessionEndTime", "professionalFee", "locationFee",
      "miscellaneousFee", "totalFee", "blueprintProposedAt", "blueprintConfirmedAt",
      "isAwaitingPatientConfirmation");

    Assert.Equal(seed.Contract.Id, body.GetProperty("id").GetInt32());
    Assert.Equal("Active", body.GetProperty("status").GetString());
    Assert.False(body.GetProperty("isAwaitingPatientConfirmation").GetBoolean());
    Assert.Equal(1500, body.GetProperty("totalFee").GetInt32());
  }

  [Fact]
  public async Task BlueprintConfirmFlow_GeneratesSessions()
  {
    var seed = await SeedActiveContractAsync("cl-blueprint");
    var clients = await ClientsForAsync(seed);
    using var patient = clients.Patient;
    using var therapist = clients.Therapist;

    // 1. Therapist sets the blueprint. TimeOnly binds "HH:mm" fine.
    var blueprint = await therapist.PutAsJsonAsync($"/api/Contracts/{seed.Contract.Id}/blueprint", new
    {
      CaseToTreat = "Back pain",
      SessionDays = "Monday",
      SessionStartTime = "09:00",
      SessionEndTime = "10:00",
      ProfessionalFee = 1200,
      LocationFee = 200,
      MiscellaneousFee = 100,
      TotalFee = 1500,
    });
    Assert.Equal(HttpStatusCode.OK, blueprint.StatusCode);
    var blueprintBody = await GetJsonAsync(blueprint);
    AssertHasFields(blueprintBody, "message");
    Assert.Equal("Blueprint updated", blueprintBody.GetProperty("message").GetString());

    // 2. Therapist sends it for patient confirmation -> PendingConfirmation.
    var send = await therapist.PostAsync($"/api/Contracts/{seed.Contract.Id}/send-for-confirmation", content: null);
    Assert.Equal(HttpStatusCode.OK, send.StatusCode);
    var sendBody = await GetJsonAsync(send);
    AssertHasFields(sendBody, "message");
    Assert.Equal("Blueprint sent for confirmation", sendBody.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var afterSend = await verify.Contracts.SingleAsync(c => c.Id == seed.Contract.Id);
      Assert.Equal(ContractStatus.PendingConfirmation, afterSend.Status);
      Assert.NotNull(afterSend.BlueprintProposedAt);
    }

    // 3. Patient confirms -> Active + the first session is generated.
    var confirm = await patient.PostAsync($"/api/Contracts/{seed.Contract.Id}/confirm", content: null);
    Assert.Equal(HttpStatusCode.OK, confirm.StatusCode);
    var confirmBody = await GetJsonAsync(confirm);
    AssertHasFields(confirmBody, "message", "sessionsCreated");
    Assert.Equal("Contract confirmed and activated", confirmBody.GetProperty("message").GetString());
    Assert.Equal(1, confirmBody.GetProperty("sessionsCreated").GetInt32());

    using (var verify = FreshDb())
    {
      var afterConfirm = await verify.Contracts.SingleAsync(c => c.Id == seed.Contract.Id);
      Assert.Equal(ContractStatus.Active, afterConfirm.Status);
      Assert.NotNull(afterConfirm.BlueprintConfirmedAt);
    }

    // 4. The whole contract -> session generation seam: the generated session must
    //    appear in the PATIENT's upcoming list as Scheduled.
    var upcoming = await patient.GetAsync("/api/Sessions/me/upcoming?take=5");
    Assert.Equal(HttpStatusCode.OK, upcoming.StatusCode);
    var list = await GetJsonAsync(upcoming);
    Assert.Equal(JsonValueKind.Array, list.ValueKind);
    Assert.NotEmpty(list.EnumerateArray());
    AssertFieldsOnEveryItem(list,
      "id", "contractId", "patientId", "patientName", "physicalTherapistId", "therapistName",
      "startAt", "endAt", "durationMinutes", "status", "contractStatus");
    Assert.All(list.EnumerateArray(), item => Assert.Equal("Scheduled", item.GetProperty("status").GetString()));
    Assert.All(list.EnumerateArray(), item => Assert.Equal(seed.Contract.Id, item.GetProperty("contractId").GetInt32()));
  }

  [Fact]
  public async Task EndContract_ReturnsShapeOrEmpty()
  {
    var seed = await SeedActiveContractAsync("cl-end");
    var clients = await ClientsForAsync(seed);
    using var therapist = clients.Therapist;

    var response = await therapist.PostAsJsonAsync($"/api/Contracts/{seed.Contract.Id}/end", new
    {
      Status = "Completed",
      Reason = "done",
    });

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "message");
    Assert.Equal("Contract marked as Completed", body.GetProperty("message").GetString());

    using (var verify = FreshDb())
    {
      var reloaded = await verify.Contracts.SingleAsync(c => c.Id == seed.Contract.Id);
      Assert.Equal(ContractStatus.Completed, reloaded.Status);
      Assert.NotNull(reloaded.EndDate);
      Assert.Equal("done", reloaded.ContractEndReason);
      Assert.NotNull(reloaded.ContractEndedAt);
    }
  }

  [Fact]
  public async Task GetForPatient_Owned_ReturnsList_OtherPatient_Forbidden()
  {
    var seed = await SeedActiveContractAsync("cl-list");
    var otherPatientUser = await CreatePatientUserAsync(DemoEmail("cl-list-other"));
    var clients = await ClientsForAsync(seed);
    using var patient = clients.Patient;
    var otherToken = await GetAccessTokenAsync(otherPatientUser.Email!);
    using var otherPatient = AuthenticatedClient(otherToken);

    var seedPatientId = await Db.Patients
      .Where(p => p.UserId == seed.PatientUser.Id)
      .Select(p => p.Id)
      .SingleAsync();

    // The owning patient sees their own contracts.
    var owned = await patient.GetAsync($"/api/Contracts/patient/{seedPatientId}");
    Assert.Equal(HttpStatusCode.OK, owned.StatusCode);
    var list = await GetJsonAsync(owned);
    Assert.Equal(JsonValueKind.Array, list.ValueKind);
    AssertFieldsOnEveryItem(list, "id", "patientId", "physicalTherapistId", "startDate", "endDate", "status");
    var ours = list.EnumerateArray().Single(i => i.GetProperty("id").GetInt32() == seed.Contract.Id);
    Assert.Equal("Active", ours.GetProperty("status").GetString());
    Assert.Equal(seedPatientId, ours.GetProperty("patientId").GetInt32());

    // A DIFFERENT patient gets 403 (ForbidResult — empty body). Freezes the
    // ownership fix: patients may only list their own contracts.
    var forbidden = await otherPatient.GetAsync($"/api/Contracts/patient/{seedPatientId}");
    Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    Assert.Equal(string.Empty, await forbidden.Content.ReadAsStringAsync());
  }

  [Fact]
  public async Task StartAndCompleteSession_ViaContractsRoutes()
  {
    var seed = await SeedActiveContractAsync("cl-session");
    var clients = await ClientsForAsync(seed);
    using var therapist = clients.Therapist;

    var session = new TherapySession
    {
      PatientId = seed.Contract.PatientId,
      PhysicalTherapistId = seed.Contract.PhysicalTherapistId,
      ContractId = seed.Contract.Id,
      StartAt = DateTime.UtcNow.AddHours(-1),
      EndAt = DateTime.UtcNow.AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1500,
      PatientFee = 1500,
    };
    Db.TherapySessions.Add(session);
    await Db.SaveChangesAsync();

    // Start -> InProgress + a startAtMs timer value for clock sync.
    var start = await therapist.PutAsync($"/api/Contracts/sessions/{session.Id}/start", content: null);
    Assert.Equal(HttpStatusCode.OK, start.StatusCode);
    var startBody = await GetJsonAsync(start);
    AssertHasFields(startBody, "startAtMs");
    Assert.True(startBody.GetProperty("startAtMs").GetInt64() > 0);

    using (var verify = FreshDb())
    {
      var afterStart = await verify.TherapySessions.SingleAsync(s => s.Id == session.Id);
      Assert.Equal(SessionStatus.InProgress, afterStart.Status);
    }

    // Complete -> Completed (empty 200 body).
    var complete = await therapist.PutAsync($"/api/Contracts/sessions/{session.Id}/complete", content: null);
    Assert.Equal(HttpStatusCode.OK, complete.StatusCode);
    Assert.Equal(string.Empty, await complete.Content.ReadAsStringAsync());

    using (var verify = FreshDb())
    {
      var afterComplete = await verify.TherapySessions.SingleAsync(s => s.Id == session.Id);
      Assert.Equal(SessionStatus.Completed, afterComplete.Status);
    }
  }
}
