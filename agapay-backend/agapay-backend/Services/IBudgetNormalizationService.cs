namespace agapay_backend.Services
{
    public interface IBudgetNormalizationService
    {
        /// <summary>
        /// Returns normalized budget score in range [0,1].
        /// </summary>
        /// <param name="therapistFee">Therapist's base fee (FeePerSession) or null if unknown.</param>
        /// <param name="patientBudget">Patient's budget (preferred) or null if not provided.</param>
        /// <returns>Normalized score (0..1).</returns>
        double ComputeBudgetScore(decimal? therapistFee, decimal? patientBudget);
    }
}
