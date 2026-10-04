using agapay_backend.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace agapay_backend.Services.Notifications
{
  public enum RealtimeHub
  {
    Chat,
    Sessions,
    Contracts,
    Notifications,
    Ratings,
    Colleagues,
    Location
  }

  /// <summary>
  /// Central wrapper over the SignalR hub contexts. Guarantees that a hub/send
  /// failure never fails the HTTP request that already committed its DB write —
  /// send errors are logged and swallowed (matches the handful of call sites that
  /// already wrapped their sends in try/catch).
  /// </summary>
  public interface IRealtimeNotifier
  {
    Task SendToUsersAsync(RealtimeHub hub, IReadOnlyCollection<string> userIds, string @event, object payload, CancellationToken cancellationToken = default);

    Task SendToUserAsync(RealtimeHub hub, string userId, string @event, object payload, CancellationToken cancellationToken = default);

    Task SendToGroupAsync(RealtimeHub hub, string groupName, string @event, object payload, CancellationToken cancellationToken = default);

    Task SendToAllAsync(RealtimeHub hub, string @event, object payload, CancellationToken cancellationToken = default);
  }

  public class RealtimeNotifier : IRealtimeNotifier
  {
    private readonly IHubContext<ChatHub> _chat;
    private readonly IHubContext<SessionsHub> _sessions;
    private readonly IHubContext<ContractsHub> _contracts;
    private readonly IHubContext<NotificationsHub> _notifications;
    private readonly IHubContext<RatingsHub> _ratings;
    private readonly IHubContext<ColleaguesHub> _colleagues;
    private readonly IHubContext<LocationHub> _location;
    private readonly ILogger<RealtimeNotifier> _logger;

    public RealtimeNotifier(
      IHubContext<ChatHub> chat,
      IHubContext<SessionsHub> sessions,
      IHubContext<ContractsHub> contracts,
      IHubContext<NotificationsHub> notifications,
      IHubContext<RatingsHub> ratings,
      IHubContext<ColleaguesHub> colleagues,
      IHubContext<LocationHub> location,
      ILogger<RealtimeNotifier> logger)
    {
      _chat = chat;
      _sessions = sessions;
      _contracts = contracts;
      _notifications = notifications;
      _ratings = ratings;
      _colleagues = colleagues;
      _location = location;
      _logger = logger;
    }

    public Task SendToUsersAsync(RealtimeHub hub, IReadOnlyCollection<string> userIds, string @event, object payload, CancellationToken cancellationToken = default)
    {
      if (userIds == null || userIds.Count == 0) return Task.CompletedTask;
      return SendSafeAsync(hub, clients => clients.Users(userIds).SendAsync(@event, payload, cancellationToken), @event);
    }

    public Task SendToUserAsync(RealtimeHub hub, string userId, string @event, object payload, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrEmpty(userId)) return Task.CompletedTask;
      return SendSafeAsync(hub, clients => clients.User(userId).SendAsync(@event, payload, cancellationToken), @event);
    }

    public Task SendToGroupAsync(RealtimeHub hub, string groupName, string @event, object payload, CancellationToken cancellationToken = default)
    {
      if (string.IsNullOrEmpty(groupName)) return Task.CompletedTask;
      return SendSafeAsync(hub, clients => clients.Group(groupName).SendAsync(@event, payload, cancellationToken), @event);
    }

    public Task SendToAllAsync(RealtimeHub hub, string @event, object payload, CancellationToken cancellationToken = default)
    {
      return SendSafeAsync(hub, clients => clients.All.SendAsync(@event, payload, cancellationToken), @event);
    }

    private IHubClients ClientsFor(RealtimeHub hub) => hub switch
    {
      RealtimeHub.Chat => _chat.Clients,
      RealtimeHub.Sessions => _sessions.Clients,
      RealtimeHub.Contracts => _contracts.Clients,
      RealtimeHub.Notifications => _notifications.Clients,
      RealtimeHub.Ratings => _ratings.Clients,
      RealtimeHub.Colleagues => _colleagues.Clients,
      RealtimeHub.Location => _location.Clients,
      _ => throw new ArgumentOutOfRangeException(nameof(hub), hub, null)
    };

    private async Task SendSafeAsync(RealtimeHub hub, Func<IHubClients, Task> send, string @event)
    {
      try
      {
        await send(ClientsFor(hub));
      }
      catch (Exception ex)
      {
        _logger.LogWarning(ex, "SignalR send failed for event {Event} on hub {Hub}; request continues", @event, hub);
      }
    }
  }
}
