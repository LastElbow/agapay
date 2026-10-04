using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Hubs
{
    [Authorize]
    public class ContractsHub : Hub
    {
        // Currently no client-to-server methods are required.
        // The server will broadcast events using IHubContext<ContractsHub>.

        /// <summary>
        /// Keepalive ping method to prevent connection timeout on Render free tier (60s WebSocket timeout).
        /// </summary>
        public Task Ping()
        {
            return Task.CompletedTask;
        }
    }
}

