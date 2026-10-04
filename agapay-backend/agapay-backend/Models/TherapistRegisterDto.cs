namespace agapay_backend.Models
{
    public class TherapistRegisterDto
    {
        public required string FirstName { get; set; }
        public required string LastName { get; set; }
        public required string Email { get; set; }
        public required string Password { get; set; }
        public required string LicenseNumber { get; set; }
        public string? WorkPhoneNumber { get; set; }
        public string? Gender { get; set; }
    }
}
