using System.Security.Claims;
using agapay_backend.Controllers;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Tests;

/// <summary>
/// Characterization tests that freeze the external behavior (status codes, response
/// shapes, DB state transitions) of the SessionsController endpoints whose bodies
/// were extracted into SessionService.
/// </summary>
public class SessionsControllerMoveCharacterizationTests
{
  [Fact]
  public async Task Create_HappyPath_ReturnsOkWithIdAndSetsStatusScheduled()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_CreateSession_Happy_" + Guid.NewGuid())
      .Options;

    var therapistUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    SeedTherapistPatientAndContract(db, therapistUserId, out var therapist, out var contract);
    await db.SaveChangesAsync();

    var controller = CreateController(db, therapistUserId, role: "PhysicalTherapist");

    var startAt = DateTime.UtcNow.AddDays(7);
    var request = new CreateSessionRequest
    {
      TherapistId = therapist.Id,
      ContractId = contract.Id,
      StartAt = startAt,
      EndAt = startAt.AddHours(1),
      LocationAddress = "Test location",
      Latitude = 14.5995,
      Longitude = 120.9842,
    };

    var result = await controller.Create(request);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(StatusCodes.Status200OK, ok.StatusCode);
    var id = (int)ok.Value!.GetType().GetProperty("id")!.GetValue(ok.Value)!;
    Assert.True(id > 0);

    var session = await db.TherapySessions.SingleAsync(s => s.Id == id);
    Assert.Equal(SessionStatus.Scheduled, session.Status);
    Assert.Equal(therapist.Id, session.PhysicalTherapistId);
    Assert.Equal(contract.Id, session.ContractId);
    Assert.Equal(60, session.DurationMinutes);
  }

  [Fact]
  public async Task Cancel_HappyPath_TherapistCancelsScheduledSession_ReturnsOkAndMarksCancelled()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_CancelSession_Happy_" + Guid.NewGuid())
      .Options;

    var therapistUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    SeedTherapistPatientAndContract(db, therapistUserId, out var therapist, out var contract);

    var session = new TherapySession
    {
      Patient = contract.Patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1500,
      PatientFee = 1500,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, therapistUserId, role: "PhysicalTherapist");

    var body = new CancelSessionRequest { Reason = "Therapist unavailable" };
    var result = await controller.Cancel(session.Id, body);

    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(StatusCodes.Status200OK, ok.StatusCode);
    var message = ok.Value!.GetType().GetProperty("message")?.GetValue(ok.Value)?.ToString();
    Assert.Equal("Session cancelled", message);

    var reloaded = await db.TherapySessions.SingleAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.Cancelled, reloaded.Status);
    Assert.Equal(CancellationInitiator.Therapist, reloaded.CancelledBy);
    Assert.Equal("Therapist unavailable", reloaded.CancellationReason);
    Assert.NotNull(reloaded.CancelledAt);
  }

  [Fact]
  public async Task MarkAsDone_HappyPath_ReturnsOkAndSetsStatusDoneForToday()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_MarkAsDone_Happy_" + Guid.NewGuid())
      .Options;

    var therapistUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    SeedTherapistPatientAndContract(db, therapistUserId, out var therapist, out var contract);

    var session = new TherapySession
    {
      Patient = contract.Patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddHours(-2),
      EndAt = DateTime.UtcNow.AddHours(-1),
      DurationMinutes = 60,
      Status = SessionStatus.InProgress,
      TotalFee = 1500,
      PatientFee = 1500,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, therapistUserId, role: "PhysicalTherapist");

    var result = await controller.MarkAsDone(session.Id);

    var ok = Assert.IsType<OkResult>(result);
    Assert.Equal(StatusCodes.Status200OK, ok.StatusCode);

    var reloaded = await db.TherapySessions.SingleAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.DoneForToday, reloaded.Status);
  }

  private static void SeedTherapistPatientAndContract(
    agapayDbContext db, Guid therapistUserId, out PhysicalTherapist therapist, out Contract contract)
  {
    var therapistUser = new User
    {
      Id = therapistUserId,
      UserName = "therapist-move@test.local",
      Email = "therapist-move@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patientUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "patient-move@test.local",
      Email = "patient-move@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    therapist = new PhysicalTherapist
    {
      UserId = therapistUserId,
      User = therapistUser,
      LicenseNumber = "PT-MOVE-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var patient = new Patient
    {
      UserId = patientUser.Id,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    db.Users.AddRange(therapistUser, patientUser);
    db.PhysicalTherapists.Add(therapist);
    db.Patients.Add(patient);

    contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      EndDate = DateTime.UtcNow.Date.AddDays(30),
      Status = ContractStatus.Active,
      TotalFee = 1500,
      ProfessionalFee = 1200,
      LocationFee = 200,
      MiscellaneousFee = 100,
      CaseToTreat = "Test case",
    };
    db.Contracts.Add(contract);
  }

  private static SessionsController CreateController(agapayDbContext db, Guid userId, string role)
  {
    var loggerFactory = LoggerFactory.Create(b => { });
    var logger = loggerFactory.CreateLogger<SessionsController>();

    var sessions = new SessionService(db, new NoopRealtimeNotifier(), loggerFactory.CreateLogger<SessionService>());

    var controller = new SessionsController(db, sessions, logger);
    controller.ControllerContext = new ControllerContext
    {
      HttpContext = new DefaultHttpContext
      {
        User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
          new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
          new Claim(ClaimTypes.Role, role)
        }, authenticationType: "TestAuth"))
      }
    };

    return controller;
  }
}
