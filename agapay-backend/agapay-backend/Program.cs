using agapay_backend.Hubs;
using agapay_backend.Middleware;
using agapay_backend.Startup;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

// Load optional local secrets file (ignored by git) to override any settings
// This allows keeping sensitive values out of appsettings.json
builder.Configuration.AddJsonFile("appsettings.Local.json", optional: true, reloadOnChange: true);

// Add services to the container (registrations live in Startup/AgapayServiceCollectionExtensions.cs).
builder.Services
  .AddAgapayApiDefaults()
  .AddAgapayCors(builder.Configuration, builder.Environment)
  .AddAgapayDatabase(builder.Configuration, builder.Environment)
  .AddAgapayBackgroundServices()
  .AddAgapayIdentityAndAuth(builder.Configuration, builder.Environment)
  .AddAgapayOptions(builder.Configuration)
  .AddAgapayRateLimiting()
  .AddAgapayHttpClients(builder.Configuration)
  .AddAgapayDomainServices(builder.Configuration)
  .AddAgapayResponseCompression();

var app = builder.Build();

// Global catch-all: unhandled exceptions return the app's error contract JSON.
app.UseMiddleware<ExceptionHandlingMiddleware>();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
  app.MapScalarApiReference();
  app.MapOpenApi();
}
else
{
  // Enforce HSTS in production for stronger transport security
  app.UseHsts();
}

// Optionally migrate and seed the database on startup.
// In Production, prefer controlling this via configuration to avoid accidental destructive changes.
// (Implementation in Startup/AgapayStartupTasks.cs)
if (!app.Environment.IsEnvironment("Testing"))
{
  await AgapayStartupTasks.RunDatabaseStartupAsync(app);
}

app.UseHttpsRedirection();

app.UseResponseCompression();

// CORS
app.UseCors("AllowReactApp");

app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

// Check if user is suspended/banned and block restricted actions
app.UseSuspensionCheck();

app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");
app.MapHub<LocationHub>("/locationhub");
app.MapHub<ContractsHub>("/hubs/contracts");
app.MapHub<SessionsHub>("/hubs/sessions");
app.MapHub<RatingsHub>("/hubs/ratings");
app.MapHub<ColleaguesHub>("/hubs/colleagues");
app.MapHub<NotificationsHub>("/hubs/notifications");

app.Run();

public partial class Program { }
