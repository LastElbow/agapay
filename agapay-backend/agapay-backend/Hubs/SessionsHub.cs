using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Hubs
{
  [Authorize]
  public class SessionsHub : Hub
  {
    // The server broadcasts session lifecycle events; no client invocations required yet.

    /// <summary>
    /// Keepalive ping method to prevent connection timeout on Render free tier (60s WebSocket timeout).
    /// </summary>
    public Task Ping()
    {
      return Task.CompletedTask;
    }
  }
}

