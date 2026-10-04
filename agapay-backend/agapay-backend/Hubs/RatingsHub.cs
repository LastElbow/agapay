using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Hubs
{
    [Authorize]
    public class RatingsHub : Hub
    {
        // The server broadcasts rating events; no client invocations required yet.
    }
}
