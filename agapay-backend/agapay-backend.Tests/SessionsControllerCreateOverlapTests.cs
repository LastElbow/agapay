using System.Security.Claims;
using agapay_backend.Controllers;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Models.Requests;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Tests;

public class SessionsControllerCreateOverlapTests
{
  [Fact]
  public async Task Create_WhenOverlapsExistingSession_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_CreateSession_Overlap_" + Guid.NewGuid())
      .Options;

    var therapistUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var therapistUser = new User
    {
      Id = therapistUserId,
      UserName = "therapist-create@test.local",
      Email = "therapist-create@test.local",
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
      UserName = "patient-create@test.local",
      Email = "patient-create@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUserId,
      User = therapistUser,
      LicenseNumber = "PT-CREATE-001",
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

    var contract = new Contract
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

    var existingStart = DateTime.UtcNow.AddDays(10);
    var existingEnd = existingStart.AddHours(1);

    var existing = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = existingStart,
      EndAt = existingEnd,
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1500,
      PatientFee = 1500,
    };
    db.TherapySessions.Add(existing);
    await db.SaveChangesAsync();

    var controller = CreateController(db, therapistUserId, role: "PhysicalTherapist");

    var attempted = new CreateSessionRequest
    {
      TherapistId = therapist.Id,
      ContractId = contract.Id,
      StartAt = existingStart.AddMinutes(30),
      EndAt = existingEnd.AddMinutes(30),
      LocationAddress = "Test",
      Latitude = 14.5995,
      Longitude = 120.9842,
    };

    var result = await controller.Create(attempted);

    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

    var message = badRequest.Value?.GetType().GetProperty("message")?.GetValue(badRequest.Value)?.ToString();
    Assert.Equal("The selected time conflicts with another session.", message);
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
