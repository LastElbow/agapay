using System.Security.Claims;
using agapay_backend.Controllers;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Tests;

public class SessionsControllerRescheduleDeclineTests
{
  [Fact]
  public async Task DeclineReschedule_WhenSessionMissing_ReturnsNotFound()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_NotFound_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.DeclineReschedule(sessionId: 999999);

    Assert.IsType<NotFoundResult>(result);
  }

  [Fact]
  public async Task DeclineReschedule_WhenUserIsNotSessionPatient_ReturnsForbid()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_Forbid_" + Guid.NewGuid())
      .Options;

    var actualPatientUserId = Guid.NewGuid();
    var otherUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = actualPatientUserId,
      UserName = "patient-owner-decline@test.local",
      Email = "patient-owner-decline@test.local",
      FirstName = "Owner",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var otherUser = new User
    {
      Id = otherUserId,
      UserName = "patient-other-decline@test.local",
      Email = "patient-other-decline@test.local",
      FirstName = "Other",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-owner-decline@test.local",
      Email = "therapist-owner-decline@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = actualPatientUserId,
      User = patientUser,
      FirstName = "Owner",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-DECLINE-FORBID",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, otherUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(4),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(4).AddHours(1),
      TotalFee = 1000,
      PatientFee = 1000,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, otherUserId, role: "Patient");
    var result = await controller.DeclineReschedule(session.Id);

    Assert.IsType<ForbidResult>(result);
  }

  [Fact]
  public async Task DeclineReschedule_WhenPendingProposal_RevertsToScheduledAndClearsProposalFields()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-decline@test.local",
      Email = "patient-decline@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-decline@test.local",
      Email = "therapist-decline@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-DECLINE-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var originalStart = DateTime.UtcNow.AddDays(2);
    var originalEnd = originalStart.AddHours(1);
    var proposedStart = DateTime.UtcNow.AddDays(4);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = originalStart,
      EndAt = originalEnd,
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");

    var result = await controller.DeclineReschedule(session.Id);
    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(StatusCodes.Status200OK, ok.StatusCode ?? StatusCodes.Status200OK);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);

    Assert.Equal(SessionStatus.Scheduled, updated.Status);
    Assert.Null(updated.CancelledAt);
    Assert.Null(updated.CancelledBy);
    Assert.Null(updated.CancellationReason);

    // Declining does not change the schedule itself; it only withdraws the proposal.
    Assert.Equal(originalStart, updated.StartAt);
    Assert.Equal(originalEnd, updated.EndAt);

    // Proposal fields should be cleared
    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);

    // Reliever proposal fields should be cleared even if they were not set
    Assert.False(updated.IsRelieverProposed);
    Assert.Null(updated.RelieverTherapistId);
    Assert.Null(updated.RelieverSubstitutionReason);
  }

  [Fact]
  public async Task DeclineReschedule_WhenRelieverProposed_RevertsToScheduledAndClearsRelieverFields()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_Reliever_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-decline2@test.local",
      Email = "patient-decline2@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-orig@test.local",
      Email = "therapist-orig@test.local",
      FirstName = "Orig",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var relieverUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-reliever@test.local",
      Email = "therapist-reliever@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1988, 8, 8),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-DECLINE-ORIG",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var reliever = new PhysicalTherapist
    {
      UserId = relieverUser.Id,
      User = relieverUser,
      LicenseNumber = "PT-DECLINE-REL",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(therapist, reliever);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(5);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      IsRelieverProposed = true,
      RelieverTherapistId = reliever.Id,
      RelieverSubstitutionReason = "Cover needed",
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");

    var result = await controller.DeclineReschedule(session.Id);
    Assert.IsType<OkObjectResult>(result);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.Scheduled, updated.Status);
    Assert.Null(updated.CancelledAt);

    // Proposal + reliever proposal fields should be cleared
    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);

    Assert.False(updated.IsRelieverProposed);
    Assert.Null(updated.RelieverTherapistId);
    Assert.Null(updated.RelieverSubstitutionReason);
  }

  [Fact]
  public async Task DeclineReschedule_WhenFromPatientCancellationRequest_RevertsToPendingCancellation()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_FromCancellation_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-decline4@test.local",
      Email = "patient-decline4@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-decline4@test.local",
      Email = "therapist-decline4@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-DECLINE-004",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(4),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(4).AddHours(1),
      PatientCancellationReason = "Schedule conflict",
      CancellationRequestedAt = DateTime.UtcNow.AddHours(-1),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.DeclineReschedule(session.Id);
    Assert.IsType<OkObjectResult>(result);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.PendingCancellation, updated.Status);

    // Proposal fields should be cleared
    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);
  }

  [Fact]
  public async Task DeclineReschedule_WhenNotPendingRescheduleApproval_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_DeclineReschedule_NotPending_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-decline3@test.local",
      Email = "patient-decline3@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-decline3@test.local",
      Email = "therapist-decline3@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-DECLINE-003",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");

    var result = await controller.DeclineReschedule(session.Id);
    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
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

  private sealed class NoOpHubContext : IHubContext<SessionsHub>
  {
    public IHubClients Clients { get; } = new NoOpHubClients();
    public IGroupManager Groups { get; } = new NoOpGroupManager();
  }

  private sealed class NoOpHubClients : IHubClients
  {
    private static readonly IClientProxy Proxy = new NoOpClientProxy();

    public IClientProxy All => Proxy;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Client(string connectionId) => Proxy;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
    public IClientProxy Group(string groupName) => Proxy;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
    public IClientProxy User(string userId) => Proxy;
    public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
  }

  private sealed class NoOpGroupManager : IGroupManager
  {
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
  }

  private sealed class NoOpClientProxy : IClientProxy
  {
    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
  }
}
