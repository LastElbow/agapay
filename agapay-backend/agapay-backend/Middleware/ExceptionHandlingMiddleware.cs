using agapay_backend.Models;

namespace agapay_backend.Middleware
{
  /// <summary>
  /// Global catch-all so unhandled exceptions return the app's error contract
  /// ({ code, message, details }) instead of an empty 500 or the developer page.
  /// Existing per-endpoint try/catch blocks are untouched — this only catches
  /// what escapes them. Registered as the first middleware in Program.cs.
  /// </summary>
  public class ExceptionHandlingMiddleware
  {
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlingMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlingMiddleware(
      RequestDelegate next,
      ILogger<ExceptionHandlingMiddleware> logger,
      IHostEnvironment environment)
    {
      _next = next;
      _logger = logger;
      _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
      try
      {
        await _next(context);
      }
      catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
      {
        // Client went away; nothing to respond to and no server fault.
      }
      catch (Exception ex)
      {
        if (context.Response.HasStarted)
        {
          _logger.LogError(ex, "Unhandled exception after response started for {Method} {Path}", context.Request.Method, context.Request.Path);
          throw;
        }

        await WriteErrorResponseAsync(context, ex);
      }
    }

    private async Task WriteErrorResponseAsync(HttpContext context, Exception ex)
    {
      _logger.LogError(ex, "Unhandled exception for {Method} {Path}", context.Request.Method, context.Request.Path);

      context.Response.Clear();
      context.Response.StatusCode = StatusCodes.Status500InternalServerError;

      object? details = _environment.IsDevelopment()
        ? $"{ex.GetType().Name}: {ex.Message}"
        : null;

      var error = ErrorResponseDto.Create("INTERNAL_ERROR", "An unexpected error occurred.", details);
      await context.Response.WriteAsJsonAsync(error, context.RequestAborted);
    }
  }
}
