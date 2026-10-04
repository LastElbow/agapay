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

public class SessionsControllerGetSessionDetailAuthorizationTests
{
  [Fact]
  public async Task GetSessionDetail_WhenUserIsContractTherapistButNotSessionTherapist_ReturnsOk()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_GetSessionDetail_ContractTherapistCanView_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    var contractTherapistUserId = Guid.NewGuid();
    var relieverTherapistUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient@test.local",
      Email = "patient@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var contractTherapistUser = new User
    {
      Id = contractTherapistUserId,
      UserName = "contract-therapist@test.local",
      Email = "contract-therapist@test.local",
      FirstName = "Contract",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var relieverTherapistUser = new User
    {
      Id = relieverTherapistUserId,
      UserName = "reliever-therapist@test.local",
      Email = "reliever-therapist@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1986, 6, 6),
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

    var contractTherapist = new PhysicalTherapist
    {
      UserId = contractTherapistUserId,
      User = contractTherapistUser,
      LicenseNumber = "PT-CONTRACT-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var relieverTherapist = new PhysicalTherapist
    {
      UserId = relieverTherapistUserId,
      User = relieverTherapistUser,
      LicenseNumber = "PT-RELIEVER-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, contractTherapistUser, relieverTherapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(contractTherapist, relieverTherapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = contractTherapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = relieverTherapist, // session assigned to reliever
      Contract = contract, // contract owned by the original therapist
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, contractTherapistUserId, role: "PhysicalTherapist");
    var result = await controller.GetSessionDetail(session.Id);

    Assert.IsType<OkObjectResult>(result);
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
