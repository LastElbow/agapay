namespace agapay_backend.Models.Requests
{
  /// <summary>
  /// Request/binding models extracted from TherapistController. Property names and
  /// JSON shapes are unchanged — clients bind to these exact fields.
  /// </summary>

  // DTO for adding colleague
  public class AddColleagueRequest
  {
    public string? Notes { get; set; }
  }
}
