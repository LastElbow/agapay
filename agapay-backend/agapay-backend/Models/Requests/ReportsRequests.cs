namespace agapay_backend.Models.Requests
{
    /// <summary>
    /// Request/binding models extracted from ReportsController. Property names and
    /// JSON shapes are unchanged — clients bind to these exact fields.
    /// </summary>

    public class SubmitReportRequest
    {
        public Guid ReportedUserId { get; set; }
        public string Reason { get; set; } = string.Empty;
        public string? Category { get; set; }
    }
}
