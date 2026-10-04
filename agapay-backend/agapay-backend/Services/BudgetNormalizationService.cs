using System;

namespace agapay_backend.Services
{
    public class BudgetNormalizationService : IBudgetNormalizationService
    {
        // Neutral score returned when budget or fee is unknown
        private const double NeutralScore = 0.5;

        public double ComputeBudgetScore(decimal? therapistFee, decimal? patientBudget)
        {
            // If patient didn't specify a budget, return neutral to avoid penalizing
            if (!patientBudget.HasValue || patientBudget.Value <= 0m)
                return NeutralScore;

            // If therapist fee unknown, return neutral (or choose other policy)
            if (!therapistFee.HasValue)
                return NeutralScore;

            var ptFee = (double)therapistFee.Value;
            var pb = (double)patientBudget.Value;

            // If therapist fee within patient's budget -> perfect score
            if (ptFee <= pb) return 1.0;

            // Compute ratio (PT_Base_Fee - Patient_Budget) / Patient_Budget
            var ratio = (ptFee - pb) / pb;
            var denom = 1.0 + Math.Max(0.0, ratio);
            var score = 1.0 / denom;

            // Ensure numeric stability and clamp to [0,1]
            return Math.Clamp(score, 0.0, 1.0);
        }
    }
}
