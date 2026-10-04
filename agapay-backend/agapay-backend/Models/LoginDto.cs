namespace agapay_backend.Models
{
    public class LoginDto
    {
        public required string Email { get; set; }
        public required string Password { get; set; }
        public string? DeviceId { get; set; }
        public string? DeviceName { get; set; }
    }
}
