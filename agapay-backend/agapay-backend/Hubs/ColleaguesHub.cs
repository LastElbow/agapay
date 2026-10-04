using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Hubs
{
  [Authorize(Roles = "PhysicalTherapist")]
  public class ColleaguesHub : Hub
  {
    // This hub is used for real-time colleague network updates
    // No methods needed - just a conduit for server-to-client messages
  }
}
