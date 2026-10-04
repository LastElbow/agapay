using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Models;

namespace agapay_backend.Services
{
    public interface IRecommendationService
    {
        Task<List<MatchDto>> GetRecommendationsAsync(
            int patientId,
            int top = 5,
            PatientPreferencesDto? patientPreferences = null,
            CancellationToken ct = default);
    }
}
