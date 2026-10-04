using System;

namespace agapay_backend.Models.Requests
{
    /// <summary>
    /// Request/binding models extracted from SessionsController. Property names and
    /// JSON shapes are unchanged — frontends bind to these exact fields.
    /// </summary>

    public class CreateSessionRequest
    {
        public int TherapistId { get; set; }
        public int ContractId { get; set; }
        public DateTime StartAt { get; set; }
        public DateTime EndAt { get; set; }
        public string? LocationAddress { get; set; }
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
    }

    public class CancelSessionRequest
    {
        public string? Reason { get; set; }
        public DateTime? ProposedRescheduleStartAt { get; set; }
        public DateTime? ProposedRescheduleEndAt { get; set; }
        public int? RelieverTherapistId { get; set; }
        public string? RelieverSubstitutionReason { get; set; }
    }

    public class RequestCancellationRequest
    {
        public string? Reason { get; set; }
    }

    public class AcknowledgeCancellationRequest
    {
        public string? RescheduleStartAt { get; set; }
        public string? RescheduleEndAt { get; set; }
    }

    public class DeclineRescheduleBindingModel
    {
        public string? Reason { get; set; }
    }

    public class LogTodayBindingModel
    {
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
    }

    public class SessionLogDto
    {
        public int Id { get; set; }
        public DateTime StartTime { get; set; }
        public DateTime EndTime { get; set; }
        public DateTime Date { get; set; }
        public double DurationMinutes => (EndTime - StartTime).TotalMinutes;
    }

    public class RescheduleSessionRequest
    {
        public DateTime NewStartAt { get; set; }
        public DateTime NewEndAt { get; set; }
    }
}
