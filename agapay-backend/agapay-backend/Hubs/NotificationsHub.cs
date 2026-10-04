using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Hubs
{
    [Authorize]
    public class NotificationsHub : Hub
    {
        // Server broadcasts notification events to connected users
        // Client should connect and listen for "NewNotification" events
    }
}
