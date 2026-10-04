namespace agapay_backend.Models.Requests
{
    /// <summary>
    /// Request/binding models extracted from AdminController. Property names and
    /// JSON shapes are unchanged — clients bind to these exact fields.
    /// </summary>

    public class UpdateReportStatusRequest
    {
        public string Status { get; set; } = string.Empty;
        public string? ResolutionSummary { get; set; }
    }

    public class UpdateReportPriorityRequest
    {
        public string Priority { get; set; } = "Medium";
    }

    public class UpdateReportNotesRequest
    {
        public string? AdminNotes { get; set; }
    }

    public class WarnUserRequest
    {
        public string Reason { get; set; } = string.Empty;
    }

    public class SuspendUserRequest
    {
        public string Reason { get; set; } = string.Empty;
        public string Duration { get; set; } = "7days"; // 1day, 3days, 7days, 30days, permanent
    }

    public class BanUserRequest
    {
        public string Reason { get; set; } = string.Empty;
    }

    public class ModifySuspensionRequest
    {
        public string NewDuration { get; set; } = "7days"; // 1day, 3days, 7days, 30days, lift
    }
}
