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

public class SessionsControllerRelieverProposalTests
{
  [Fact]
  public async Task AcceptRelieverProposal_WhenValid_MovesToPendingRescheduleApproval()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_RelieverAccept_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    var relieverUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-relieveraccept@test.local",
      Email = "patient-relieveraccept@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var originalTherapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-orig-relieveraccept@test.local",
      Email = "therapist-orig-relieveraccept@test.local",
      FirstName = "Orig",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var relieverUser = new User
    {
      Id = relieverUserId,
      UserName = "therapist-relieveraccept@test.local",
      Email = "therapist-relieveraccept@test.local",
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

    var originalTherapist = new PhysicalTherapist
    {
      UserId = originalTherapistUser.Id,
      User = originalTherapistUser,
      LicenseNumber = "PT-REL-ACC-ORIG",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var relieverTherapist = new PhysicalTherapist
    {
      UserId = relieverUserId,
      User = relieverUser,
      LicenseNumber = "PT-REL-ACC-REL",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, originalTherapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(originalTherapist, relieverTherapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(6);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRelieverAcceptance,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      IsRelieverProposed = true,
      RelieverTherapistId = relieverTherapist.Id,
      RelieverSubstitutionReason = "Cover needed",
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, relieverUserId, role: "PhysicalTherapist");

    var result = await controller.AcceptRelieverProposal(session.Id);
    Assert.IsType<OkObjectResult>(result);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.PendingRescheduleApproval, updated.Status);
    Assert.NotNull(updated.RelieverRespondedAt);

    // Proposal should still be present; patient needs to approve/decline next
    Assert.Equal(proposedStart, updated.ProposedRescheduleStartAt);
    Assert.Equal(proposedEnd, updated.ProposedRescheduleEndAt);
    Assert.True(updated.IsRelieverProposed);
    Assert.Equal(relieverTherapist.Id, updated.RelieverTherapistId);
  }

  [Fact]
  public async Task AcceptRelieverProposal_WhenTherapistRecordMissing_ReturnsForbid()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_RelieverAccept_NoTherapistRecord_" + Guid.NewGuid())
      .Options;

    var relieverUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    // No PhysicalTherapist row for this user.
    var controller = CreateController(db, relieverUserId, role: "PhysicalTherapist");

    var result = await controller.AcceptRelieverProposal(sessionId: 123);
    Assert.IsType<ForbidResult>(result);
  }

  [Fact]
  public async Task AcceptRelieverProposal_WhenNotPendingRelieverAcceptance_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_RelieverAccept_WrongStatus_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    var relieverUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "p@test.local",
      Email = "p@test.local",
      FirstName = "Patient",
      LastName = "User",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var originalTherapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "t@test.local",
      Email = "t@test.local",
      FirstName = "Original",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var relieverUser = new User
    {
      Id = relieverUserId,
      UserName = "r@test.local",
      Email = "r@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1988, 8, 8),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var patient = new Patient { UserId = patientUserId, User = patientUser, FirstName = "P", LastName = "P", RelationshipToUser = "Self", IsActive = true };
    var originalTherapist = new PhysicalTherapist { UserId = originalTherapistUser.Id, User = originalTherapistUser, LicenseNumber = "PT-X-ORIG", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };
    var relieverTherapist = new PhysicalTherapist { UserId = relieverUserId, User = relieverUser, LicenseNumber = "PT-X-REL", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };

    db.Users.AddRange(patientUser, originalTherapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(originalTherapist, relieverTherapist);

    var contract = new Contract { Patient = patient, PhysicalTherapist = originalTherapist, StartDate = DateTime.UtcNow.Date, Status = ContractStatus.Active };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      IsRelieverProposed = true,
      RelieverTherapistId = relieverTherapist.Id,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(6),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(6).AddHours(1),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, relieverUserId, role: "PhysicalTherapist");

    var result = await controller.AcceptRelieverProposal(session.Id);
    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    Assert.Equal("Session is not pending reliever acceptance", badRequest.Value);
  }

  [Fact]
  public async Task DeclineRelieverProposal_WhenValid_RevertsToScheduledAndClearsProposalFields()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_RelieverDecline_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    var relieverUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-relieverdecline@test.local",
      Email = "patient-relieverdecline@test.local",
      FirstName = "Patient",
      LastName = "User",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var originalTherapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-orig-relieverdecline@test.local",
      Email = "therapist-orig-relieverdecline@test.local",
      FirstName = "Original",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var relieverUser = new User
    {
      Id = relieverUserId,
      UserName = "therapist-relieverdecline@test.local",
      Email = "therapist-relieverdecline@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1988, 8, 8),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var patient = new Patient { UserId = patientUserId, User = patientUser, FirstName = "P", LastName = "P", RelationshipToUser = "Self", IsActive = true };
    var originalTherapist = new PhysicalTherapist { UserId = originalTherapistUser.Id, User = originalTherapistUser, LicenseNumber = "PT-REL-DEC-ORIG", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };
    var relieverTherapist = new PhysicalTherapist { UserId = relieverUserId, User = relieverUser, LicenseNumber = "PT-REL-DEC-REL", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };

    db.Users.AddRange(patientUser, originalTherapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(originalTherapist, relieverTherapist);

    var contract = new Contract { Patient = patient, PhysicalTherapist = originalTherapist, StartDate = DateTime.UtcNow.Date, Status = ContractStatus.Active };
    db.Contracts.Add(contract);

    var originalStart = DateTime.UtcNow.AddDays(3);
    var originalEnd = originalStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      Contract = contract,
      StartAt = originalStart,
      EndAt = originalEnd,
      DurationMinutes = 60,
      Status = SessionStatus.PendingRelieverAcceptance,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(6),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(6).AddHours(1),
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      IsRelieverProposed = true,
      RelieverTherapistId = relieverTherapist.Id,
      RelieverSubstitutionReason = "Cover needed",
      RelieverProposedAt = DateTime.UtcNow.AddMinutes(-6),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, relieverUserId, role: "PhysicalTherapist");

    var result = await controller.DeclineRelieverProposal(session.Id);
    Assert.IsType<OkObjectResult>(result);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.Scheduled, updated.Status);
    Assert.NotNull(updated.RelieverRespondedAt);

    // Reverted and cleared all reliever + reschedule proposal fields
    Assert.False(updated.IsRelieverProposed);
    Assert.Null(updated.RelieverTherapistId);
    Assert.Null(updated.RelieverSubstitutionReason);
    Assert.Null(updated.RelieverProposedAt);

    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);

    // Start/end should remain original when proposal is cleared
    Assert.Equal(originalStart, updated.StartAt);
    Assert.Equal(originalEnd, updated.EndAt);
  }

  [Fact]
  public async Task DeclineRelieverProposal_WhenNotPendingRelieverAcceptance_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_RelieverDecline_WrongStatus_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    var relieverUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-reliever-wrongstatus@test.local",
      Email = "patient-reliever-wrongstatus@test.local",
      FirstName = "Patient",
      LastName = "User",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var originalTherapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-orig-wrongstatus@test.local",
      Email = "therapist-orig-wrongstatus@test.local",
      FirstName = "Original",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var relieverUser = new User
    {
      Id = relieverUserId,
      UserName = "r2@test.local",
      Email = "r2@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1988, 8, 8),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Patient",
      LastName = "User",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var originalTherapist = new PhysicalTherapist
    {
      UserId = originalTherapistUser.Id,
      User = originalTherapistUser,
      LicenseNumber = "PT-REL-DEC-WRONG-ORIG",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var relieverTherapist = new PhysicalTherapist
    {
      UserId = relieverUserId,
      User = relieverUser,
      LicenseNumber = "PT-REL-DEC-WRONG",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, originalTherapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(originalTherapist, relieverTherapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      // Wrong status for this endpoint; should be PendingRelieverAcceptance
      Status = SessionStatus.Scheduled,
      IsRelieverProposed = true,
      RelieverTherapistId = relieverTherapist.Id,
      RelieverSubstitutionReason = "Cover needed",
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(6),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(6).AddHours(1),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, relieverUserId, role: "PhysicalTherapist");

    var result = await controller.DeclineRelieverProposal(session.Id);
    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    Assert.Equal("Session is not pending reliever acceptance", badRequest.Value);
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
