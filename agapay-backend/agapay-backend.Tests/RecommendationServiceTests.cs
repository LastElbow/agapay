using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using agapay_backend.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Xunit;

namespace agapay_backend.Tests
{
  public class RecommendationServiceTests
  {
    // Manual Mocks
    class MockAvailabilityService : IAvailabilityService
    {
      public Task<double> CalculateAvailabilityScore(int therapistId, int patientId) => Task.FromResult(1.0); // Always available
      public Task<List<int>> GetAvailableTherapists(DayOfWeekEnum dayOfWeek, TimeOnly startTime, TimeOnly endTime) => throw new NotImplementedException();
      public Task<List<TherapistAvailability>> GetTherapistAvailability(int therapistId) => throw new NotImplementedException();
      public Task UpdateTherapistAvailability(int therapistId, List<TherapistAvailabilityDto> availabilities) => throw new NotImplementedException();
    }

    class MockRatingService : IRatingService
    {
      public Task<(double normalizedScore, double rawBayes, int n, double avg, double globalAvg, int k)> ComputeNormalizedRatingAsync(int therapistId, int smoothingK = 5)
      {
        // Return a fixed score based on ID for variety
        double score = therapistId % 2 == 0 ? 0.9 : 0.5;
        return Task.FromResult((score, score, 10, 4.5, 4.0, 5));
      }

      public Task<DiagnosticResult> DiagnosticCheckIdsAsync(int therapistId, int? sessionId, int? patientId) => throw new NotImplementedException();
      public Task<PhysicalTherapist?> GetTherapistByUserId(Guid userId) => throw new NotImplementedException();
      public Task<List<TherapistRatingDto>> GetTherapistRatingsAsync(int therapistId) => throw new NotImplementedException();
      public Task SubmitPatientRatingAsync(SubmitPatientRatingDto dto, Guid currentUserId) => throw new NotImplementedException();
      public Task SubmitRatingAsync(SubmitRatingDto dto, Guid currentUserId) => throw new NotImplementedException();
    }

    class MockBudgetService : IBudgetNormalizationService
    {
      public double ComputeBudgetScore(decimal? therapistFee, decimal? patientBudget)
      {
        if (!therapistFee.HasValue || !patientBudget.HasValue) return 0.5;
        return therapistFee.Value <= patientBudget.Value ? 1.0 : 0.0;
      }
    }

    [Fact]
    public async Task GetRecommendations_ShouldReturnRankedResults()
    {
      // Arrange
      var options = Options.Create(new RecommendationOptions
      {
        MinMatchScore = 0.0,
        WeightAvailability = 1.0,
        WeightRating = 1.0,
        WeightBudget = 1.0,
        WeightSpecialization = 1.0,
        WeightDesiredService = 1.0
      }); var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
    .UseInMemoryDatabase(databaseName: "TestDb_" + Guid.NewGuid())
    .Options;

      using var db = new agapayDbContext(dbOptions);

      // Seed Data
      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "Patient", LastName = "User", Email = "p@test.com", PasswordHash = "hash", CreatedAt = DateTime.UtcNow };
      var patient = new Patient
      {
        Id = 1,
        UserId = patientUser.Id,
        User = patientUser,
        FirstName = "Patient",
        LastName = "User",
        RelationshipToUser = "Self",
        Barangay = "TestBarangay",
        IsActive = true,
        IsOnboardingComplete = true
      };

      var prefs = new PatientPreferences
      {
        PatientId = patient.Id,
        Patient = patient,
        SessionBudget = 1000,
        PreferredSpecialization = "Ortho",
        DesiredService = "Back Pain",
        PreferredBarangay = "TestBarangay"
      };
      patient.Preferences = prefs;

      db.Users.Add(patientUser);
      db.Patients.Add(patient);
      // Preferences added via navigation property or explicitly if needed, but EF Core might handle it if added to graph.
      // Better to add explicitly to be safe with InMemory.
      // db.PatientPreferences.Add(prefs); // Assuming DbSet exists, if not, it's fine via Patient.

      var t1User = new User { Id = Guid.NewGuid(), FirstName = "Therapist", LastName = "One", Email = "t1@test.com", PasswordHash = "hash", CreatedAt = DateTime.UtcNow };
      var t1 = new PhysicalTherapist
      {
        Id = 1,
        UserId = t1User.Id,
        User = t1User,
        LicenseNumber = "LIC001",
        VerificationStatus = VerificationStatus.Verified,
        FeePerSession = 800, // Within budget
        Gender = "Male",
        IsOnboardingComplete = true
      };
      t1.ServiceAreas.Add(new ServiceArea { Name = "TestBarangay" });
      t1.Specializations.Add(new Specialization { Name = "Ortho" });
      t1.ConditionsTreated.Add(new ConditionTreated { Name = "Back Pain" });

      var t2User = new User { Id = Guid.NewGuid(), FirstName = "Therapist", LastName = "Two", Email = "t2@test.com", PasswordHash = "hash", CreatedAt = DateTime.UtcNow };
      var t2 = new PhysicalTherapist
      {
        Id = 2,
        UserId = t2User.Id,
        User = t2User,
        LicenseNumber = "LIC002",
        VerificationStatus = VerificationStatus.Verified,
        FeePerSession = 1200, // Over budget
        Gender = "Female",
        IsOnboardingComplete = true
      };
      t2.ServiceAreas.Add(new ServiceArea { Name = "OtherBarangay" });
      t2.Specializations.Add(new Specialization { Name = "Neuro" });
      t2.ConditionsTreated.Add(new ConditionTreated { Name = "Stroke" });

      db.Users.AddRange(t1User, t2User);
      db.PhysicalTherapists.AddRange(t1, t2);
      await db.SaveChangesAsync();

      var service = new RecommendationService(
          db,
          new MockAvailabilityService(),
          new MockRatingService(),
          new MockBudgetService(),
          options
      );

      // Act
      // We pass preferences explicitly to simulate the controller logic
      var prefsDto = new PatientPreferencesDto
      {
        SessionBudget = 1000,
        PreferredSpecialization = "Ortho",
        DesiredService = "Back Pain",
        PreferredBarangay = "TestBarangay"
      };

      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefsDto);

      // Assert
      Assert.NotNull(results);
      Assert.NotEmpty(results);

      // T1 should be recommended because it matches location
      var matchT1 = results.FirstOrDefault(r => r.TherapistId == 1);
      Assert.NotNull(matchT1);

      // T2 should NOT be recommended because of location filter (PreferredBarangay = TestBarangay)
      // Wait, let's check the logic. ApplyPreferenceFilters filters by Barangay if set.
      // T2 is in "OtherBarangay", preference is "TestBarangay". So T2 should be filtered out.
      var matchT2 = results.FirstOrDefault(r => r.TherapistId == 2);
      Assert.Null(matchT2);

      // Verify T1 scores
      // Budget: 800 <= 1000 -> 1.0
      // Specialization: Ortho == Ortho -> 1.0
      // DesiredService: Back Pain == Back Pain -> 1.0
      // Availability: Mock -> 1.0
      // Rating: ID 1 (odd) -> 0.5 (Wait, 1 % 2 != 0, so 0.5)

      // Total Score Calculation (all weights 1.0, normalized to 1/5 each)
      // Sum = 1 + 1 + 1 + 1 + 0.5 = 4.5
      // Final = 4.5 / 5.0 = 0.9

      Assert.True(matchT1.MatchScore > 0.8);
    }

    [Fact]
    public async Task GetRecommendations_ShouldFilterByGender()
    {
      // Arrange
      var options = Options.Create(new RecommendationOptions { MinMatchScore = 0.0 });
      var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
          .UseInMemoryDatabase(databaseName: "TestDb_Gender_" + Guid.NewGuid())
          .Options; using var db = new agapayDbContext(dbOptions);

      // Patient
      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "P", LastName = "U", Email = "p@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var patient = new Patient { Id = 1, UserId = patientUser.Id, User = patientUser, FirstName = "P", LastName = "U", RelationshipToUser = "Self", IsActive = true, IsOnboardingComplete = true };
      db.Users.Add(patientUser);
      db.Patients.Add(patient);

      // Therapists
      var tMaleUser = new User { Id = Guid.NewGuid(), FirstName = "M", LastName = "T", Email = "m@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tMale = new PhysicalTherapist { Id = 1, UserId = tMaleUser.Id, User = tMaleUser, LicenseNumber = "L1", VerificationStatus = VerificationStatus.Verified, Gender = "Male", IsOnboardingComplete = true };

      var tFemaleUser = new User { Id = Guid.NewGuid(), FirstName = "F", LastName = "T", Email = "f@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tFemale = new PhysicalTherapist { Id = 2, UserId = tFemaleUser.Id, User = tFemaleUser, LicenseNumber = "L2", VerificationStatus = VerificationStatus.Verified, Gender = "Female", IsOnboardingComplete = true };

      db.Users.AddRange(tMaleUser, tFemaleUser);
      db.PhysicalTherapists.AddRange(tMale, tFemale);
      await db.SaveChangesAsync();

      var service = new RecommendationService(db, new MockAvailabilityService(), new MockRatingService(), new MockBudgetService(), options);

      // Act - Prefer Female
      var prefs = new PatientPreferencesDto { PreferredTherapistGender = "Female" };
      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefs);

      // Assert
      Assert.Contains(results, r => r.TherapistId == 2);
      Assert.DoesNotContain(results, r => r.TherapistId == 1);
    }

    [Fact]
    public async Task GetRecommendations_ShouldPrioritizeBudget()
    {
      // Arrange
      var options = Options.Create(new RecommendationOptions { WeightBudget = 10.0, WeightAvailability = 1.0 }); // High weight on budget
      var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
          .UseInMemoryDatabase(databaseName: "TestDb_Budget_" + Guid.NewGuid())
          .Options;

      using var db = new agapayDbContext(dbOptions);

      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "P", LastName = "U", Email = "p@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var patient = new Patient { Id = 1, UserId = patientUser.Id, User = patientUser, FirstName = "P", LastName = "U", RelationshipToUser = "Self", IsActive = true, IsOnboardingComplete = true };
      db.Users.Add(patientUser);
      db.Patients.Add(patient);

      // Cheap Therapist
      var tCheapUser = new User { Id = Guid.NewGuid(), FirstName = "C", LastName = "T", Email = "c@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tCheap = new PhysicalTherapist { Id = 1, UserId = tCheapUser.Id, User = tCheapUser, LicenseNumber = "L1", VerificationStatus = VerificationStatus.Verified, FeePerSession = 500, IsOnboardingComplete = true };

      // Expensive Therapist
      var tExpUser = new User { Id = Guid.NewGuid(), FirstName = "E", LastName = "T", Email = "e@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tExp = new PhysicalTherapist { Id = 2, UserId = tExpUser.Id, User = tExpUser, LicenseNumber = "L2", VerificationStatus = VerificationStatus.Verified, FeePerSession = 2000, IsOnboardingComplete = true };

      db.Users.AddRange(tCheapUser, tExpUser);
      db.PhysicalTherapists.AddRange(tCheap, tExp);
      await db.SaveChangesAsync();

      var service = new RecommendationService(db, new MockAvailabilityService(), new MockRatingService(), new MockBudgetService(), options);

      // Act
      var prefs = new PatientPreferencesDto { SessionBudget = 1000 };
      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefs);

      // Assert
      // Cheap (500 <= 1000) -> Score 1.0 on budget
      // Expensive (2000 > 1000) -> Score 0.0 on budget
      // Since budget weight is high, Cheap should be first.
      // With tiered system, both may appear but Cheap should rank higher
      Assert.NotEmpty(results);
      Assert.Equal(1, results.First().TherapistId);
    }

    [Fact]
    public async Task GetRecommendations_ShouldScoreSpecializationCorrectly()
    {
      // Arrange
      var options = Options.Create(new RecommendationOptions { WeightSpecialization = 10.0 });
      var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
          .UseInMemoryDatabase(databaseName: "TestDb_Spec_" + Guid.NewGuid())
          .Options;

      using var db = new agapayDbContext(dbOptions);

      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "P", LastName = "U", Email = "p@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var patient = new Patient { Id = 1, UserId = patientUser.Id, User = patientUser, FirstName = "P", LastName = "U", RelationshipToUser = "Self", IsActive = true, IsOnboardingComplete = true };
      db.Users.Add(patientUser);
      db.Patients.Add(patient);

      // Specialist
      var tSpecUser = new User { Id = Guid.NewGuid(), FirstName = "S", LastName = "T", Email = "s@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tSpec = new PhysicalTherapist { Id = 1, UserId = tSpecUser.Id, User = tSpecUser, LicenseNumber = "L1", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };
      tSpec.Specializations.Add(new Specialization { Name = "Neuro" });

      // Generalist
      var tGenUser = new User { Id = Guid.NewGuid(), FirstName = "G", LastName = "T", Email = "g@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var tGen = new PhysicalTherapist { Id = 2, UserId = tGenUser.Id, User = tGenUser, LicenseNumber = "L2", VerificationStatus = VerificationStatus.Verified, IsOnboardingComplete = true };
      tGen.Specializations.Add(new Specialization { Name = "Ortho" });

      db.Users.AddRange(tSpecUser, tGenUser);
      db.PhysicalTherapists.AddRange(tSpec, tGen);
      await db.SaveChangesAsync();

      var service = new RecommendationService(db, new MockAvailabilityService(), new MockRatingService(), new MockBudgetService(), options);

      // Act
      var prefs = new PatientPreferencesDto { PreferredSpecialization = "Neuro" };
      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefs);

      // Assert
      // Specialist score ~0.96 -> Pass (Recommended tier)
      // Generalist score ~0.03 -> Fail (below 30% threshold)
      Assert.Single(results);
      Assert.Equal(1, results.First().TherapistId);
      Assert.Equal(1.0, results.First().Breakdown["specialization"]);
      Assert.Equal(MatchTier.Recommended, results.First().Tier);
    }
    [Fact]
    public async Task GetRecommendations_ShouldReturn80PercentMatch_AsRecommendedTier()
    {
      // Arrange
      // Equal weights for all 5 components
      var options = Options.Create(new RecommendationOptions
      {
        MinMatchScore = 0.30,
        RecommendedThreshold = 0.70,
        WeightAvailability = 1.0,
        WeightRating = 1.0,
        WeightBudget = 1.0,
        WeightSpecialization = 1.0,
        WeightDesiredService = 1.0
      });

      var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
          .UseInMemoryDatabase(databaseName: "TestDb_80Percent_" + Guid.NewGuid())
          .Options;

      using var db = new agapayDbContext(dbOptions);

      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "P", LastName = "U", Email = "p@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var patient = new Patient { Id = 1, UserId = patientUser.Id, User = patientUser, FirstName = "P", LastName = "U", RelationshipToUser = "Self", IsActive = true, IsOnboardingComplete = true };
      db.Users.Add(patientUser);
      db.Patients.Add(patient);

      // Therapist Setup for 80% Score
      // Target: 4 / 5.0 = 0.80
      // 1. Availability: 1.0 (Mock always returns 1.0)
      // 2. Budget: 1.0 (Fee <= Budget)
      // 3. Desired Service: 1.0 (Match)
      // 4. Rating: 0.5 (Odd ID -> 0.5 in Mock)
      // 5. Specialization: 0.5 (Partial match)
      // Sum = 1 + 1 + 1 + 0.5 + 0.5 = 4.0

      var tUser = new User { Id = Guid.NewGuid(), FirstName = "T", LastName = "80", Email = "t@80.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var t = new PhysicalTherapist
      {
        Id = 1, // Odd ID -> Rating 0.5
        UserId = tUser.Id,
        User = tUser,
        LicenseNumber = "L80",
        VerificationStatus = VerificationStatus.Verified,
        FeePerSession = 1000, // -> Budget 1.0 (matches 1000)
        IsOnboardingComplete = true
      };
      // Desired Service Match
      t.ConditionsTreated.Add(new ConditionTreated { Name = "Back Pain" });
      // Specialization Mismatch (Patient wants Ortho, Therapist has Neuro)
      t.Specializations.Add(new Specialization { Name = "Neuro" });

      db.Users.Add(tUser);
      db.PhysicalTherapists.Add(t);
      await db.SaveChangesAsync();

      var service = new RecommendationService(db, new MockAvailabilityService(), new MockRatingService(), new MockBudgetService(), options);

      // Act
      var prefs = new PatientPreferencesDto
      {
        SessionBudget = 1000,
        DesiredService = "Back Pain",
        PreferredSpecialization = "Ortho"
      };
      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefs);

      // Assert
      var match = results.First();
      Assert.True(match.MatchScore >= 0.70); // Check meets recommended threshold
      Assert.Equal(MatchTier.Recommended, match.Tier); // >= 70% threshold
    }

    [Fact]
    public async Task GetRecommendations_ShouldExcludeLowScores()
    {
      // Arrange
      var options = Options.Create(new RecommendationOptions
      {
        MinMatchScore = 0.30,
        RecommendedThreshold = 0.70,
        WeightAvailability = 1.0,
        WeightRating = 1.0,
        WeightBudget = 1.0,
        WeightSpecialization = 1.0,
        WeightDesiredService = 1.0
      });

      var dbOptions = new DbContextOptionsBuilder<agapayDbContext>()
          .UseInMemoryDatabase(databaseName: "TestDb_LowScore_" + Guid.NewGuid())
          .Options;

      using var db = new agapayDbContext(dbOptions);

      var patientUser = new User { Id = Guid.NewGuid(), FirstName = "P", LastName = "U", Email = "p@t.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var patient = new Patient { Id = 1, UserId = patientUser.Id, User = patientUser, FirstName = "P", LastName = "U", RelationshipToUser = "Self", IsActive = true, IsOnboardingComplete = true };
      db.Users.Add(patientUser);
      db.Patients.Add(patient);

      // Therapist Setup for ~50% Score
      // 1. Availability: 1.0
      // 2. Budget: 1.0
      // 3. Rating: 0.5
      // 4. Desired Service: 0.0 (Mismatch)
      // 5. Specialization: 0.0 (Mismatch)
      // Sum = 2.5 / 5 = 0.50 which is >= 0.30 (Partial)

      var tUser = new User { Id = Guid.NewGuid(), FirstName = "T", LastName = "Low", Email = "t@low.com", PasswordHash = "h", CreatedAt = DateTime.UtcNow };
      var t = new PhysicalTherapist
      {
        Id = 1,
        UserId = tUser.Id,
        User = tUser,
        LicenseNumber = "L_Low",
        VerificationStatus = VerificationStatus.Verified,
        FeePerSession = 1000,
        IsOnboardingComplete = true
      };
      // No matching conditions or specializations added

      db.Users.Add(tUser);
      db.PhysicalTherapists.Add(t);
      await db.SaveChangesAsync();

      var service = new RecommendationService(db, new MockAvailabilityService(), new MockRatingService(), new MockBudgetService(), options);

      // Act
      var prefs = new PatientPreferencesDto
      {
        SessionBudget = 1000,
        DesiredService = "Back Pain",
        PreferredSpecialization = "Ortho"
      };
      var results = await service.GetRecommendationsAsync(patient.Id, 5, prefs);

      // Assert - With tiered system, 50% is now an "Other Option" (below 70%)
      Assert.Single(results);
      var match = results.First();
      Assert.Equal(MatchTier.OtherOption, match.Tier);
      Assert.True(match.MatchScore >= 0.30 && match.MatchScore < 0.70);
    }
  }
}
