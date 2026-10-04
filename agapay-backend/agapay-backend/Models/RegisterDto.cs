namespace agapay_backend.Models
{
    public class RegisterDto
    {
        public required string FirstName { get; set; } 
        public required string LastName { get; set; }
        public required string Email { get; set; }
        public required string Password { get; set; }
        public DateOnly DateOfBirth { get; set; }
        public string? Gender { get; set; }
        public string? DesiredRole { get; set; }
    }
}
