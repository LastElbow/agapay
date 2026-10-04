using Microsoft.EntityFrameworkCore.Storage.ValueConversion.Internal;

namespace agapay_backend.Models
{
    public class TherapistVerificationDto
    {
        public bool IsApproved { get; set; }
        public string? RejectionReason { get; set; }
    }
}
