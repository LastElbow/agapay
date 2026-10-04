using agapay_backend.Data;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace agapay_backend.Tests;

public class AuthApiFactory : WebApplicationFactory<Program>
{
  private readonly InMemoryDatabaseRoot _dbRoot = new();
  private readonly string _dbName = $"AgapayTestDb-{Guid.NewGuid():N}";

  protected override void ConfigureWebHost(IWebHostBuilder builder)
  {
    builder.UseEnvironment("Testing");

    // Ensure each test gets a clean, isolated in-memory database.
    builder.ConfigureServices(services =>
    {
      services.RemoveAll(typeof(DbContextOptions<agapayDbContext>));
      services.RemoveAll(typeof(agapayDbContext));

      services.AddDbContext<agapayDbContext>(options =>
        options.UseInMemoryDatabase(_dbName, _dbRoot));
    });

    builder.ConfigureAppConfiguration((context, config) =>
    {
      // Program.cs requires Jwt:Key to be non-empty; tests don't need a real secret,
      // but startup must be able to construct the signing key.
      var overrides = new Dictionary<string, string?>
      {
        ["Jwt:Key"] = "TEST_ONLY_SUPER_SECRET_KEY_32_CHARS_MIN_123456",
        ["Jwt:Issuer"] = "agapay-test",
        ["Jwt:Audience"] = "agapay-test",
        // Enables deterministic OTP codes ("123456") for demo accounts in tests.
        ["Seed:BypassOtpForDemoAccounts"] = "true",
        // Preserve the historical demo backdoors in the Testing environment.
        ["Otp:DemoFixedCodeEnabled"] = "true",
        ["Auth:DemoEmailBypassEnabled"] = "true"
      };

      config.AddInMemoryCollection(overrides);
    });
  }
}
