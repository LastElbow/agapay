using System.Security.Claims;
using agapay_backend.Controllers;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Services.Sessions;
using agapay_backend.Services.Contracts;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Tests;

/// <summary>
/// Authorization tests for the contract listing endpoints (previously any
/// authenticated user could read anyone's contracts).
/// UpdateStatus's Admin-only gate is enforced by the [Authorize(Roles=...)]
/// attribute, which needs the auth middleware (not exercised by direct
/// controller instantiation), so it is not covered here.
/// </summary>
public class ContractsControllerAuthorizationTests
{
  [Fact]
  public async Task GetForPatient_WhenCallerDoesNotOwnIt_ReturnsForbid()
  {
    using var setup = await SeedAsync();
    var otherPatient = setup.CreatePatientControllerCaller();

    var result = await otherPatient.GetForPatient(setup.Patient1.Id);

    Assert.IsType<ForbidResult>(result);
  }

  [Fact]
  public async Task GetForPatient_WhenCallerOwnsIt_ReturnsOwnContracts()
  {
    using var setup = await SeedAsync();
    var owner = setup.CreatePatient1ControllerCaller();

    var result = await owner.GetForPatient(setup.Patient1.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var contracts = Assert.IsAssignableFrom<System.Collections.IEnumerable>(ok.Value);
    Assert.Single(contracts.Cast<object>());
  }

  [Fact]
  public async Task GetForPatient_WhenTherapistParticipant_ReturnsOnlyOwnContracts()
  {
    using var setup = await SeedAsync();
    var therapist = setup.CreateTherapistControllerCaller();

    var result = await therapist.GetForPatient(setup.Patient1.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var contracts = Assert.IsAssignableFrom<System.Collections.IEnumerable>(ok.Value);
    Assert.Single(contracts.Cast<object>());
  }

  [Fact]
  public async Task GetForTherapist_WhenCallerDoesNotOwnIt_ReturnsForbid()
  {
    using var setup = await SeedAsync();
    var otherTherapist = setup.CreateOtherTherapistControllerCaller();

    var result = await otherTherapist.GetForTherapist(setup.Therapist1.Id);

    Assert.IsType<ForbidResult>(result);
  }

  [Fact]
  public async Task GetForTherapist_WhenCallerOwnsIt_ReturnsOwnContracts()
  {
    using var setup = await SeedAsync();
    var owner = setup.CreateTherapistControllerCaller();

    var result = await owner.GetForTherapist(setup.Therapist1.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var contracts = Assert.IsAssignableFrom<System.Collections.IEnumerable>(ok.Value);
    Assert.Single(contracts.Cast<object>());
  }

  [Fact]
  public async Task GetForPatient_WhenAdmin_ReturnsRequestedContracts()
  {
    using var setup = await SeedAsync();
    var admin = setup.CreateAdminControllerCaller();

    var result = await admin.GetForPatient(setup.Patient1.Id);

    var ok = Assert.IsType<OkObjectResult>(result);
    var contracts = Assert.IsAssignableFrom<System.Collections.IEnumerable>(ok.Value);
    Assert.Single(contracts.Cast<object>());
  }

  private static async Task<Setup> SeedAsync()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ContractsAuthz_" + Guid.NewGuid())
      .Options;

    var patient1UserId = Guid.NewGuid();
    var otherPatientUserId = Guid.NewGuid();
    var therapist1UserId = Guid.NewGuid();
    var otherTherapistUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    db.Users.AddRange(
      new User
      {
        Id = patient1UserId, UserName = "p1@test.local", Email = "p1@test.local",
        FirstName = "Patient", LastName = "One", DateOfBirth = new DateOnly(1990, 1, 1),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, EmailConfirmed = true,
      },
      new User
      {
        Id = otherPatientUserId, UserName = "p2@test.local", Email = "p2@test.local",
        FirstName = "Patient", LastName = "Two", DateOfBirth = new DateOnly(1991, 2, 2),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, EmailConfirmed = true,
      },
      new User
      {
        Id = therapist1UserId, UserName = "t1@test.local", Email = "t1@test.local",
        FirstName = "Therapist", LastName = "One", DateOfBirth = new DateOnly(1985, 1, 1),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, EmailConfirmed = true,
      },
      new User
      {
        Id = otherTherapistUserId, UserName = "t2@test.local", Email = "t2@test.local",
        FirstName = "Therapist", LastName = "Two", DateOfBirth = new DateOnly(1986, 3, 3),
        CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow, EmailConfirmed = true,
      });

    var patient1User = db.Users.Local.First(u => u.Id == patient1UserId);
    var patient1 = new Patient
    {
      UserId = patient1UserId, User = patient1User, FirstName = "Patient", LastName = "One",
      DateOfBirth = new DateOnly(1990, 1, 1), RelationshipToUser = "Self", IsActive = true,
    };
    var otherPatientUser = db.Users.Local.First(u => u.Id == otherPatientUserId);
    var otherPatient = new Patient
    {
      UserId = otherPatientUserId, User = otherPatientUser, FirstName = "Patient", LastName = "Two",
      DateOfBirth = new DateOnly(1991, 2, 2), RelationshipToUser = "Self", IsActive = true,
    };
    var therapist1User = db.Users.Local.First(u => u.Id == therapist1UserId);
    var therapist1 = new PhysicalTherapist
    {
      UserId = therapist1UserId, User = therapist1User, LicenseNumber = "PT-AUTHZ-001",
      VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true,
    };
    var otherTherapistUser = db.Users.Local.First(u => u.Id == otherTherapistUserId);
    var otherTherapist = new PhysicalTherapist
    {
      UserId = otherTherapistUserId, User = otherTherapistUser, LicenseNumber = "PT-AUTHZ-002",
      VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true,
    };
    db.Patients.AddRange(patient1, otherPatient);
    db.PhysicalTherapists.AddRange(therapist1, otherTherapist);

    var contract = new Contract
    {
      Patient = patient1,
      PhysicalTherapist = therapist1,
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
    await db.SaveChangesAsync();

    return new Setup(options, patient1, otherPatient, therapist1, otherTherapist,
      patient1UserId, otherPatientUserId, therapist1UserId, otherTherapistUserId);
  }

  private sealed class Setup : IDisposable
  {
    private readonly DbContextOptions<agapayDbContext> _options;

    public Patient Patient1 { get; }
    public Patient OtherPatient { get; }
    public PhysicalTherapist Therapist1 { get; }
    public PhysicalTherapist OtherTherapist { get; }

    private readonly Guid _patient1UserId;
    private readonly Guid _otherPatientUserId;
    private readonly Guid _therapist1UserId;
    private readonly Guid _otherTherapistUserId;

    public Setup(DbContextOptions<agapayDbContext> options,
      Patient patient1, Patient otherPatient,
      PhysicalTherapist therapist1, PhysicalTherapist otherTherapist,
      Guid patient1UserId, Guid otherPatientUserId,
      Guid therapist1UserId, Guid otherTherapistUserId)
    {
      _options = options;
      Patient1 = patient1;
      OtherPatient = otherPatient;
      Therapist1 = therapist1;
      OtherTherapist = otherTherapist;
      _patient1UserId = patient1UserId;
      _otherPatientUserId = otherPatientUserId;
      _therapist1UserId = therapist1UserId;
      _otherTherapistUserId = otherTherapistUserId;
    }

    public ContractsController CreatePatient1ControllerCaller() =>
      CreateController(_patient1UserId, role: "Patient");
    public ContractsController CreatePatientControllerCaller() =>
      CreateController(_otherPatientUserId, role: "Patient");
    public ContractsController CreateTherapistControllerCaller() =>
      CreateController(_therapist1UserId, role: "PhysicalTherapist");
    public ContractsController CreateOtherTherapistControllerCaller() =>
      CreateController(_otherTherapistUserId, role: "PhysicalTherapist");
    public ContractsController CreateAdminControllerCaller() =>
      CreateController(Guid.NewGuid(), role: "Admin");

    private ContractsController CreateController(Guid userId, string role)
    {
      var db = new agapayDbContext(_options);
      var loggerFactory = LoggerFactory.Create(b => { });
      var logger = loggerFactory.CreateLogger<ContractsController>();

      var sessions = new SessionService(db, new NoopRealtimeNotifier(), loggerFactory.CreateLogger<SessionService>());
      var blueprints = new ContractBlueprintService(db, new NoopRealtimeNotifier(), loggerFactory.CreateLogger<ContractBlueprintService>());

      var controller = new ContractsController(db, sessions, blueprints, logger);
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

    public void Dispose() { }
  }

  private sealed class NoOpHubContext<THub> : IHubContext<THub> where THub : Hub
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
