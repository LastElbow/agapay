namespace agapay_backend.Services.Notifications
{
  /// <summary>
  /// Every client-side event name used with SendAsync across controllers, hubs and
  /// background services. Single source of truth — frontends depend on these exact strings.
  /// </summary>
  public static class SignalREvents
  {
    // Chat hub
    public const string ReceiveMessage = "ReceiveMessage";
    public const string MessageRejected = "MessageRejected";
    public const string BlockedByOther = "BlockedByOther";
    public const string BlockStatusChanged = "BlockStatusChanged";
    public const string UnblockedByOther = "UnblockedByOther";
    public const string ConversationClosed = "ConversationClosed";
    public const string ConversationReopened = "ConversationReopened";
    public const string ConversationCleared = "ConversationCleared";
    public const string PatientContextUpdated = "PatientContextUpdated";

    // Sessions hub
    public const string SessionStarted = "SessionStarted";
    public const string SessionMarkedDone = "SessionMarkedDone";
    public const string SessionsRefresh = "SessionsRefresh";
    public const string SessionCreated = "SessionCreated";
    public const string SessionCancelled = "SessionCancelled";
    public const string SessionCompleted = "SessionCompleted";
    public const string SessionRescheduled = "SessionRescheduled";
    public const string RescheduleProposed = "RescheduleProposed";
    public const string RescheduleApproved = "RescheduleApproved";
    public const string RescheduleDeclined = "RescheduleDeclined";
    public const string RelieverProposed = "RelieverProposed";
    public const string RelieverProposalSent = "RelieverProposalSent";
    public const string RelieverApproved = "RelieverApproved";
    public const string RelieverAccepted = "RelieverAccepted";
    public const string RelieverDeclined = "RelieverDeclined";
    public const string CancellationRequested = "CancellationRequested";

    // Contracts hub
    public const string ContractPending = "ContractPending";
    public const string ContractActivated = "ContractActivated";
    public const string ContractDeclined = "ContractDeclined";
    public const string ContractEnded = "ContractEnded";

    // Notifications hub
    public const string NewNotification = "NewNotification";
    public const string ForceLogout = "ForceLogout";

    // Ratings hub
    public const string RatingSubmitted = "RatingSubmitted";

    // Colleagues hub
    public const string ColleagueRequestUpdated = "ColleagueRequestUpdated";

    // Location hub (group-based)
    public const string ReceiveLocationUpdate = "ReceiveLocationUpdate";
    public const string RequestLocation = "RequestLocation";
    public const string TrackingStopped = "TrackingStopped";
    public const string PatientLocationUpdated = "PatientLocationUpdated";
  }
}
