using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Services
{
    public class RatingService : IRatingService
    {
        private readonly agapayDbContext _context;
        private readonly ILogger<RatingService> _logger;

        public RatingService(agapayDbContext context, ILogger<RatingService> logger)
        {
            _context = context;
            _logger = logger;
        }

        // Enforce: patient must have a completed session with the therapist; one rating per session.
        public async Task SubmitRatingAsync(SubmitRatingDto dto, Guid currentUserId)
        {
            _logger.LogInformation("🟢 RatingService.SubmitRatingAsync called");
            _logger.LogInformation("📥 Input: TherapistId={TherapistId}, ContractId={ContractId}, Score={Score}, UserId={UserId}", dto.TherapistId, dto.ContractId, dto.Score, currentUserId);

            // find patient id for current user
            _logger.LogInformation("🔍 Looking up patient by userId...");
            var patient = await _context.Patients.FirstOrDefaultAsync(p => p.UserId == currentUserId);

            if (patient is null)
            {
                _logger.LogError("❌ Patient account not found for userId: {UserId}", currentUserId);
                throw new InvalidOperationException("Patient account not found.");
            }

            _logger.LogInformation("✅ Patient found: Id={PatientId}, Name={FirstName} {LastName}", patient.Id, patient.FirstName, patient.LastName);

            // validate score
            if (dto.Score < 1 || dto.Score > 5)
            {
                _logger.LogError("❌ Invalid score: {Score}", dto.Score);
                throw new ArgumentOutOfRangeException(nameof(dto.Score));
            }
            _logger.LogInformation("✅ Score is valid: {Score}", dto.Score);

            // Validate contract
            _logger.LogInformation("🔍 Validating contract {ContractId}...", dto.ContractId);
            var contract = await _context.Contracts
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.Id == dto.ContractId);

            if (contract is null)
            {
                _logger.LogError("❌ Contract {ContractId} not found in database", dto.ContractId);
                throw new InvalidOperationException($"Contract with ID {dto.ContractId} not found.");
            }
            _logger.LogInformation("✅ Contract found: Id={ContractId}, PatientId={PatientId}, TherapistId={TherapistId}, Status={Status}", contract.Id, contract.PatientId, contract.PhysicalTherapistId, contract.Status);

            if (contract.PatientId != patient.Id)
            {
                _logger.LogError("❌ Contract ownership mismatch: contract.PatientId={ContractPatientId}, patient.Id={PatientId}", contract.PatientId, patient.Id);
                throw new UnauthorizedAccessException("You are not the owner of this contract.");
            }

            if (contract.PhysicalTherapistId != dto.TherapistId)
            {
                _logger.LogError("❌ Therapist mismatch: contract.TherapistId={ContractTherapistId}, dto.TherapistId={DtoTherapistId}", contract.PhysicalTherapistId, dto.TherapistId);
                throw new InvalidOperationException("Contract therapist mismatch.");
            }

            if (contract.Status != ContractStatus.Completed && contract.Status != ContractStatus.Terminated)
            {
                _logger.LogError("❌ Contract not completed or terminated: Status={Status}", contract.Status);
                throw new InvalidOperationException("Cannot rate until the contract is completed or terminated.");
            }

            // ensure no rating exists for this contract from this patient
            _logger.LogInformation("🔍 Checking for existing rating on contract {ContractId} from patient {PatientId}...", contract.Id, patient.Id);
            var existing = await _context.TherapistRatings.FirstOrDefaultAsync(r => r.ContractId == contract.Id && r.PatientId == patient.Id);
            if (existing is not null)
            {
                _logger.LogError("❌ Rating already exists for this contract: Id={RatingId}", existing.Id);
                throw new InvalidOperationException("This contract has already been rated.");
            }
            _logger.LogInformation("✅ No existing rating found for this contract");

            // Create rating
            _logger.LogInformation("💾 Creating TherapistRating entity...");
            var rating = new TherapistRating
            {
                ContractId = contract.Id,
                PhysicalTherapistId = dto.TherapistId,
                PatientId = patient.Id,
                Score = dto.Score,
                Comment = dto.Comment
            };

            _logger.LogInformation("💾 Adding rating to context...");
            await _context.TherapistRatings.AddAsync(rating);

            _logger.LogInformation("💾 Saving changes to database...");
            try
            {
                await _context.SaveChangesAsync();
                _logger.LogInformation("✅✅✅ Rating saved successfully! RatingId={RatingId}", rating.Id);
            }
            catch (DbUpdateException dbEx)
            {
                _logger.LogError(dbEx, "❌ Database error while saving rating: {Message}. Inner exception: {InnerException}", dbEx.Message, dbEx.InnerException?.Message);
                throw new InvalidOperationException($"Failed to save rating: {dbEx.InnerException?.Message ?? dbEx.Message}", dbEx);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Unexpected error while saving rating: {Message}", ex.Message);
                throw;
            }

            // Recompute aggregates safely from DB and update therapist
            var agg = await _context.TherapistRatings
                .Where(r => r.PhysicalTherapistId == dto.TherapistId)
                .GroupBy(r => r.PhysicalTherapistId)
                .Select(g => new { Count = g.Count(), Avg = g.Average(x => x.Score) })
                .FirstOrDefaultAsync();

            if (agg is not null)
            {
                var therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(t => t.Id == dto.TherapistId);
                if (therapist is not null)
                {
                    therapist.RatingCount = agg.Count;
                    therapist.AverageRating = agg.Avg;
                    await _context.SaveChangesAsync();
                }
            }
        }

        // Therapist rating a patient
        public async Task SubmitPatientRatingAsync(SubmitPatientRatingDto dto, Guid currentUserId)
        {
            // find therapist id for current user
            var therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(pt => pt.UserId == currentUserId);
            if (therapist is null) throw new InvalidOperationException("Therapist account not found.");

            // validate score
            if (dto.Score < 1 || dto.Score > 5) throw new ArgumentOutOfRangeException(nameof(dto.Score));

            // Validate contract
            var contract = await _context.Contracts.AsNoTracking().FirstOrDefaultAsync(c => c.Id == dto.ContractId);
            if (contract is null) throw new InvalidOperationException("Contract not found.");
            if (contract.PhysicalTherapistId != therapist.Id) throw new UnauthorizedAccessException("You are not the owner of this contract.");
            if (contract.PatientId != dto.PatientId) throw new InvalidOperationException("Contract patient mismatch.");
            if (contract.Status != ContractStatus.Completed && contract.Status != ContractStatus.Terminated) throw new InvalidOperationException("Cannot rate until the contract is completed or terminated.");

            // ensure no rating exists for this contract from this therapist
            var existing = await _context.PatientRatings.FirstOrDefaultAsync(r => r.ContractId == contract.Id && r.PhysicalTherapistId == therapist.Id);
            if (existing is not null) throw new InvalidOperationException("This contract has already been rated.");

            // Create rating
            var rating = new PatientRating
            {
                ContractId = contract.Id,
                PatientId = dto.PatientId,
                PhysicalTherapistId = therapist.Id,
                Score = dto.Score,
                Comment = dto.Comment
            };

            await _context.PatientRatings.AddAsync(rating);
            await _context.SaveChangesAsync();
        }

        // Compute Bayesian-normalized rating (rawBayes in 1..5) and normalized (0..1)
        public async Task<(double normalizedScore, double rawBayes, int n, double avg, double globalAvg, int k)> ComputeNormalizedRatingAsync(int therapistId, int smoothingK = 5)
        {
            var stat = await _context.TherapistRatings
                .Where(r => r.PhysicalTherapistId == therapistId)
                .GroupBy(r => r.PhysicalTherapistId)
                .Select(g => new { Count = g.Count(), Avg = (double?)g.Average(x => x.Score) })
                .FirstOrDefaultAsync();

            int n = stat?.Count ?? 0;
            double r = stat?.Avg ?? 0.0;

            var global = await _context.TherapistRatings.AverageAsync(r => (double?)r.Score) ?? 3.0; // default 3.0 if no ratings
            double m = global;
            int k = smoothingK;

            // raw Bayesian average scaled to 1..5
            double rawBayes;
            if (n == 0) rawBayes = m;
            else rawBayes = (n / (double)(n + k)) * r + (k / (double)(n + k)) * m;

            double normalized = Math.Clamp(rawBayes / 5.0, 0.0, 1.0);

            return (normalized, rawBayes, n, r, m, k);
        }

        public async Task<DiagnosticResult> DiagnosticCheckIdsAsync(int therapistId, int? sessionId, int? patientId)
        {
            var result = new DiagnosticResult();

            // Check therapist
            var therapist = await _context.PhysicalTherapists
                .Include(t => t.User)
                .FirstOrDefaultAsync(t => t.Id == therapistId);

            result.TherapistExists = therapist != null;
            result.TherapistName = therapist != null
                ? $"{therapist.User.FirstName} {therapist.User.LastName}"
                : null;

            if (!result.TherapistExists)
            {
                result.Issues.Add($"❌ TherapistId {therapistId} does NOT exist in database");
            }
            else
            {
                result.Issues.Add($"✅ TherapistId {therapistId} exists: {result.TherapistName}");
            }

            // Check session if provided
            if (sessionId.HasValue)
            {
                var session = await _context.TherapySessions
                    .FirstOrDefaultAsync(s => s.Id == sessionId.Value);

                result.SessionExists = session != null;

                if (session != null)
                {
                    result.SessionStatus = session.Status.ToString();
                    result.SessionTherapistId = session.PhysicalTherapistId;
                    result.SessionPatientId = session.PatientId;
                    result.Issues.Add($"✅ SessionId {sessionId} exists");
                    result.Issues.Add($"   Status: {result.SessionStatus}");
                    result.Issues.Add($"   TherapistId: {result.SessionTherapistId}");
                    result.Issues.Add($"   PatientId: {result.SessionPatientId}");

                    if (session.PhysicalTherapistId != therapistId)
                    {
                        result.Issues.Add($"⚠️ Session TherapistId ({session.PhysicalTherapistId}) doesn't match requested TherapistId ({therapistId})");
                    }
                }
                else
                {
                    result.Issues.Add($"❌ SessionId {sessionId} does NOT exist in database");
                }
            }

            // Check patient if provided
            if (patientId.HasValue)
            {
                var patient = await _context.Patients
                    .FirstOrDefaultAsync(p => p.Id == patientId.Value);

                result.PatientExists = patient != null;
                result.PatientName = patient != null
                    ? $"{patient.FirstName} {patient.LastName}"
                    : null;

                if (result.PatientExists == false)
                {
                    result.Issues.Add($"❌ PatientId {patientId} does NOT exist in database");
                }
                else
                {
                    result.Issues.Add($"✅ PatientId {patientId} exists: {result.PatientName}");
                }
            }

            // Generate summary
            var issueCount = result.Issues.Count(i => i.StartsWith("❌"));
            if (issueCount == 0)
            {
                result.Summary = "✅ All IDs are valid and exist in the database";
            }
            else
            {
                result.Summary = $"❌ Found {issueCount} issue(s) with the provided IDs";
            }

            return result;
        }

        public async Task<List<TherapistRatingDto>> GetTherapistRatingsAsync(int therapistId)
        {
            _logger.LogInformation("🟢 GetTherapistRatingsAsync called for therapistId: {TherapistId}", therapistId);

            var ratings = await _context.TherapistRatings
                .Where(r => r.PhysicalTherapistId == therapistId)
                .Include(r => r.Patient)
                .ThenInclude(p => p!.User)
                .Include(r => r.Contract)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new TherapistRatingDto
                {
                    Id = r.Id,
                    ContractId = r.ContractId,
                    PatientId = r.PatientId,
                    PatientName = r.Patient != null ? $"{r.Patient.FirstName} {r.Patient.LastName}" : "Unknown",
                    PatientProfilePictureUrl = r.Patient != null && r.Patient.User != null ? r.Patient.User.ProfilePictureUrl : null,
                    Score = r.Score,
                    Comment = r.Comment,
                    CreatedAt = r.CreatedAt,
                    CaseToTreat = r.Contract != null ? r.Contract.CaseToTreat : null
                })
                .ToListAsync();

            _logger.LogInformation("✅ Found {Count} ratings in TherapistRatings table for therapist {TherapistId}", ratings.Count, therapistId);
            return ratings;
        }

        public async Task<PhysicalTherapist?> GetTherapistByUserId(Guid userId)
        {
            _logger.LogInformation("🔍 Looking up therapist by userId: {UserId}", userId);
            var therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(pt => pt.UserId == userId);

            if (therapist != null)
            {
                _logger.LogInformation("✅ Therapist found: Id={TherapistId}", therapist.Id);
            }
            else
            {
                _logger.LogError("❌ No therapist found for userId: {UserId}", userId);
            }

            return therapist;
        }
    }
}
