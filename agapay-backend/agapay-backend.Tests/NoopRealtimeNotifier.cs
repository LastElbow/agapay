using agapay_backend.Services.Notifications;

namespace agapay_backend.Tests;

/// <summary>
/// IRealtimeNotifier test double: records nothing and never throws, mirroring the
/// swallow-and-log behavior of RealtimeNotifier without needing hub contexts.
/// </summary>
internal sealed class NoopRealtimeNotifier : IRealtimeNotifier
{
  public Task SendToUsersAsync(RealtimeHub hub, IReadOnlyCollection<string> userIds, string @event, object payload, CancellationToken cancellationToken = default) => Task.CompletedTask;
  public Task SendToUserAsync(RealtimeHub hub, string userId, string @event, object payload, CancellationToken cancellationToken = default) => Task.CompletedTask;
  public Task SendToGroupAsync(RealtimeHub hub, string groupName, string @event, object payload, CancellationToken cancellationToken = default) => Task.CompletedTask;
  public Task SendToAllAsync(RealtimeHub hub, string @event, object payload, CancellationToken cancellationToken = default) => Task.CompletedTask;
}
