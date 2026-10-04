using agapay_backend.Data;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Startup;

/// <summary>
/// Database startup tasks extracted from Program.cs: the production schema-drift
/// patch (DO $$ block — DO NOT remove or "clean up": production schema may be missing
/// these PhysicalTherapists columns), optional MigrateOnStartup, and seeding.
/// </summary>
public static class AgapayStartupTasks
{
  public static async Task RunDatabaseStartupAsync(WebApplication app)
  {
    using var scope = app.Services.CreateScope();
    var services = scope.ServiceProvider;

    var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger("AgapayStartup");
    var config = services.GetRequiredService<IConfiguration>();

    // Fix missing columns in PhysicalTherapists table (schema migration fix)
    try
    {
      var db = services.GetRequiredService<agapayDbContext>();
      var connection = db.Database.GetDbConnection();
      await connection.OpenAsync();
      using var cmd = connection.CreateCommand();
      cmd.CommandText = @"
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PhysicalTherapists' AND column_name = 'Address') THEN
            ALTER TABLE ""PhysicalTherapists"" ADD COLUMN ""Address"" text NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PhysicalTherapists' AND column_name = 'Barangay') THEN
            ALTER TABLE ""PhysicalTherapists"" ADD COLUMN ""Barangay"" text NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PhysicalTherapists' AND column_name = 'Latitude') THEN
            ALTER TABLE ""PhysicalTherapists"" ADD COLUMN ""Latitude"" double precision NULL;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PhysicalTherapists' AND column_name = 'Longitude') THEN
            ALTER TABLE ""PhysicalTherapists"" ADD COLUMN ""Longitude"" double precision NULL;
          END IF;
        END $$;
      ";
      await cmd.ExecuteNonQueryAsync();
      logger.LogInformation("PhysicalTherapists location columns schema check completed.");
    }
    catch (Exception ex)
    {
      logger.LogWarning(ex, "Schema fix for PhysicalTherapists columns failed (may already exist).");
    }

    try
    {
      // One-time schema migration if enabled via config
      // Set "MigrateOnStartup": true in configuration to apply EF Core migrations automatically.
      if (config.GetValue<bool>("MigrateOnStartup"))
      {
        var db = services.GetRequiredService<agapayDbContext>();
        await db.Database.MigrateAsync();
        logger.LogInformation("Database migrations applied on startup.");
      }
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "Database migration failed on startup");
      // Do not crash the app; allow diagnosing via logs. Subsequent DB usage may still fail if schema is missing.
    }

    try
    {
      // Seed reference/demo data when enabled. Default to Development only.
      // Enable explicitly in other environments with "Seed:Enabled": true
      var shouldSeed = app.Environment.IsDevelopment() || config.GetValue<bool>("Seed:Enabled");
      if (shouldSeed)
      {
        await SeedData.Initialize(services);
        logger.LogInformation("Database seed completed.");
      }
      else
      {
        logger.LogInformation("Database seed skipped (Seed:Enabled = false).");
      }
    }
    catch (Exception ex)
    {
      logger.LogError(ex, "Database seed failed on startup");
      // Don't bring down the app due to seed issues in production.
    }
  }
}
