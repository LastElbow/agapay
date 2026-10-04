namespace agapay_backend.Models
{
  public class UpdateLocationDto
  {
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? Address { get; set; }
  }
}
