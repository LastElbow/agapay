using agapay_backend.Models;
using agapay_backend.Entities;

namespace agapay_backend.Services
{
    public interface IRatingService
    {
        Task SubmitRatingAsync(SubmitRatingDto dto, Guid currentUserId);
        Task SubmitPatientRatingAsync(SubmitPatientRatingDto dto, Guid currentUserId);
        Task<(double normalizedScore, double rawBayes, int n, double avg, double globalAvg, int k)> ComputeNormalizedRatingAsync(int therapistId, int smoothingK = 5);
        Task<DiagnosticResult> DiagnosticCheckIdsAsync(int therapistId, int? sessionId, int? patientId);
        Task<List<TherapistRatingDto>> GetTherapistRatingsAsync(int therapistId);
        Task<PhysicalTherapist?> GetTherapistByUserId(Guid userId);
    }

    public class DiagnosticResult
    {
        public bool TherapistExists { get; set; }
        public string? TherapistName { get; set; }
        public bool? SessionExists { get; set; }
        public string? SessionStatus { get; set; }
        public int? SessionTherapistId { get; set; }
        public int? SessionPatientId { get; set; }
        public bool? PatientExists { get; set; }
        public string? PatientName { get; set; }
        public List<string> Issues { get; set; } = new();
        public string Summary { get; set; } = string.Empty;
    }
}
