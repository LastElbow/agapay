using agapay_backend.Common;
using agapay_backend.Common.Options;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services;
using agapay_backend.Services.Admin;
using agapay_backend.Services.Auth;
using agapay_backend.Services.Chat;
using agapay_backend.Services.Contracts;
using agapay_backend.Services.Notifications;
using agapay_backend.Services.Profiles;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;
using System.Threading.RateLimiting;

namespace agapay_backend.Startup;

/// <summary>
/// Service registrations extracted from Program.cs, grouped by concern.
/// Registration order does not matter to DI; the pipeline order in Program.cs does.
/// </summary>
public static class AgapayServiceCollectionExtensions
{
  public static IServiceCollection AddAgapayApiDefaults(this IServiceCollection services)
  {
    services.AddSignalR();
    services.AddControllers()
      .AddJsonOptions(options =>
      {
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.DictionaryKeyPolicy = JsonNamingPolicy.CamelCase;
        options.JsonSerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter());
      });

    // Return the app's error contract ({ code, message, details }) for automatic
    // model-binding 400s instead of the default ValidationProblemDetails shape.
    services.Configure<ApiBehaviorOptions>(options =>
    {
      options.InvalidModelStateResponseFactory = context =>
      {
        var errors = context.ModelState
          .Where(kv => kv.Value?.Errors.Count > 0)
          .ToDictionary(kv => kv.Key, kv => kv.Value!.Errors.Select(e => e.ErrorMessage).ToArray());
        var problem = new { code = "VALIDATION_ERROR", message = "One or more validation errors occurred.", details = errors };
        return new BadRequestObjectResult(problem);
      };
    });

    services.AddOpenApi();
    return services;
  }

  public static IServiceCollection AddAgapayCors(this IServiceCollection services, IConfiguration configuration, IWebHostEnvironment environment)
  {
    services.AddCors(options =>
    {
      options.AddPolicy("AllowReactApp", policy =>
      {
        var allowedOrigins = configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();

        policy.SetIsOriginAllowed(origin =>
        {
          // Always allow localhost and loopback IP addresses on any port for local development and testing
          if (origin.StartsWith("http://localhost:") ||
              origin.StartsWith("https://localhost:") ||
              origin.StartsWith("http://127.0.0.1:") ||
              origin.StartsWith("https://127.0.0.1:"))
          {
            return true;
          }

          // Allow ngrok tunnels in Development environment
          if (environment.IsDevelopment() && origin.Contains("ngrok"))
          {
            return true;
          }

          // Check against explicitly configured allowed origins (e.g. from appsettings.json)
          return allowedOrigins.Contains(origin);
        })
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
      });
    });
    return services;
  }

  public static IServiceCollection AddAgapayDatabase(this IServiceCollection services, IConfiguration configuration, IWebHostEnvironment environment)
  {
    if (environment.IsEnvironment("Testing"))
    {
      services.AddDbContext<agapayDbContext>(options =>
        options.UseInMemoryDatabase("AgapayTestDb"));
    }
    else
    {
      services.AddDbContext<agapayDbContext>(options =>
        options.UseNpgsql(configuration.GetConnectionString("DefaultConnection"),
            npgsqlOptions => npgsqlOptions.EnableRetryOnFailure()));
    }
    return services;
  }

  public static IServiceCollection AddAgapayBackgroundServices(this IServiceCollection services)
  {
    // Register background service for session rescheduling (runs daily at 6 AM)
    services.AddHostedService<SessionReschedulingService>();

    // Register background service for auto-transitioning sessions to InProgress
    services.AddHostedService<SessionAutoTransitionService>();
    return services;
  }

  public static IServiceCollection AddAgapayIdentityAndAuth(this IServiceCollection services, IConfiguration configuration, IWebHostEnvironment environment)
  {
    // For ASP NEt Core Identity
    services.AddIdentity<User, Role>(options =>
    {
      options.Password.RequireDigit = true;
      options.Password.RequiredLength = 8;
      options.User.RequireUniqueEmail = true;
      options.Lockout.AllowedForNewUsers = true;
      options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
      options.Lockout.MaxFailedAccessAttempts = 5;
    })
    .AddEntityFrameworkStores<agapayDbContext>()
    .AddDefaultTokenProviders();

    services.AddAuthentication(options =>
    {
      options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
      options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
      options.TokenValidationParameters = new TokenValidationParameters
      {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = configuration["Jwt:Issuer"],
        ValidAudience = configuration["Jwt:Audience"],
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(configuration["Jwt:Key"] ?? string.Empty))
      };

      // Add this section to allow SignalR to authenticate via query string
      // NOTE: covers only 5 of 7 hub paths (ratings & notifications omitted) — clients depend on this exact map.
      options.Events = new JwtBearerEvents
      {
        OnMessageReceived = context =>
        {
          var accessToken = context.Request.Query["access_token"];
          var path = context.HttpContext.Request.Path;
          if (!string.IsNullOrEmpty(accessToken) &&
                  (path.StartsWithSegments("/hubs/chat") ||
                   path.StartsWithSegments("/locationhub") ||
                   path.StartsWithSegments("/hubs/contracts") ||
                   path.StartsWithSegments("/hubs/sessions") ||
                   path.StartsWithSegments("/hubs/colleagues")))
          {
            context.Token = accessToken;
          }
          return Task.CompletedTask;
        }
      };

      options.RequireHttpsMetadata = !environment.IsDevelopment();
    });

    return services;
  }

  public static IServiceCollection AddAgapayOptions(this IServiceCollection services, IConfiguration configuration)
  {
    // Bound options (replaces inline configuration["..."] reads in services)
    services.Configure<JwtOptions>(configuration.GetSection(JwtOptions.SectionName));
    services.Configure<SupabaseOptions>(configuration.GetSection(SupabaseOptions.SectionName));
    services.Configure<OtpOptions>(configuration.GetSection(OtpOptions.SectionName));
    return services;
  }

  public static IServiceCollection AddAgapayRateLimiting(this IServiceCollection services)
  {
    services.AddRateLimiter(options =>
    {
      options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
      {
        var remoteIpAddress = context.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        return RateLimitPartition.GetSlidingWindowLimiter(remoteIpAddress, _ => new SlidingWindowRateLimiterOptions
        {
          PermitLimit = 100,
          Window = TimeSpan.FromMinutes(1),
          SegmentsPerWindow = 4,
          QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
          QueueLimit = 0
        });
      });

      options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
      options.OnRejected = (context, _) =>
      {
        context.HttpContext.Response.Headers.RetryAfter = "60";
        return ValueTask.CompletedTask;
      };
    });
    return services;
  }

  public static IServiceCollection AddAgapayHttpClients(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddHttpClient(); // generic typed/untyped clients used elsewhere

    // Named client for Supabase storage: BaseAddress + service-role headers are configured
    // once here (thread-safe) instead of being mutated per request inside the service.
    services.AddHttpClient("supabase", client =>
    {
      var supabaseUrl = configuration["Supabase:Url"]?.TrimEnd('/');
      if (!string.IsNullOrEmpty(supabaseUrl))
      {
        client.BaseAddress = new Uri(supabaseUrl);
      }
      var serviceRoleKey = configuration["Supabase:ServiceRoleKey"] ?? "";
      if (!string.IsNullOrEmpty(serviceRoleKey))
      {
        client.DefaultRequestHeaders.Add("apikey", serviceRoleKey);
        client.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", serviceRoleKey);
      }
    });
    return services;
  }

  public static IServiceCollection AddAgapayDomainServices(this IServiceCollection services, IConfiguration configuration)
  {
    services.AddSingleton<IRateLimiter, InMemoryRateLimiter>();
    services.AddMemoryCache();

    services.AddScoped<ITokenService, TokenService>();
    services.AddScoped<IAvailabilityService, AvailabilityService>();
    services.AddScoped<IRatingService, RatingService>();
    services.AddScoped<IBudgetNormalizationService, BudgetNormalizationService>();
    services.Configure<RecommendationOptions>(configuration.GetSection("Recommendation"));
    services.AddScoped<IRecommendationService, RecommendationService>();
    services.AddScoped<ISupabaseStorageService, SupabaseStorageService>();
    services.AddScoped<IEmailService, EmailService>();
    services.AddScoped<IOtpService, OtpService>();
    services.AddScoped<ISignupOtpService, SignupOtpService>();
    services.AddScoped<IChatMessageMapper, ChatMessageMapper>();

    // Cross-cutting request-context & realtime infrastructure
    services.AddHttpContextAccessor();
    services.AddScoped<ICurrentUser, CurrentUser>();
    services.AddScoped<IRealtimeNotifier, RealtimeNotifier>();

    // Domain services (logic extracted from giant controllers)
    services.AddScoped<ISessionService, SessionService>();
    services.AddScoped<IAuthService, AuthService>();
    services.AddScoped<IVerificationService, VerificationService>();
    services.AddScoped<IReportModerationService, ReportModerationService>();
    services.AddScoped<IAccountModerationService, AccountModerationService>();
    services.AddScoped<IConversationService, ConversationService>();
    services.AddScoped<IBlockingService, BlockingService>();
    services.AddScoped<IProfilePhotoService, ProfilePhotoService>();
    services.AddScoped<IContractBlueprintService, ContractBlueprintService>();

    return services;
  }

  public static IServiceCollection AddAgapayResponseCompression(this IServiceCollection services)
  {
    // Response compression for smaller JSON payloads over the wire
    services.AddResponseCompression(options =>
    {
      options.EnableForHttps = true;
      options.Providers.Add<BrotliCompressionProvider>();
      options.Providers.Add<GzipCompressionProvider>();
    });
    return services;
  }
}
