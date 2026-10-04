using agapay_backend.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Data
{
  public static partial class SeedData
  {
    private static DateTime PhtToUtc(DateOnly date, TimeOnly time)
    {
      // Philippines Time (PHT) is UTC+8 with no DST.
      var pht = new DateTime(date.Year, date.Month, date.Day, time.Hour, time.Minute, time.Second, DateTimeKind.Unspecified);
      return DateTime.SpecifyKind(pht - TimeSpan.FromHours(8), DateTimeKind.Utc);
    }

    private static async Task SeedDefenseDemoSessions(agapayDbContext context, ILogger logger)
    {
      try
      {
        var nowUtc = DateTime.UtcNow;
        var nowPht = nowUtc.AddHours(8);
        var defenseDatePht = new DateOnly(nowPht.Year, nowPht.Month, nowPht.Day);

        // Earlier / exact / later slots (PHT) — 1-hour blocks so you can demo at any time around 11AM–12PM.
        var slots = new (string Label, TimeOnly Start, TimeOnly End)[]
        {
          ("EARLIER", new TimeOnly(10, 30), new TimeOnly(11, 30)),
          ("EXACT", new TimeOnly(11, 0), new TimeOnly(12, 0)),
          ("LATER", new TimeOnly(11, 30), new TimeOnly(12, 30)),
        };

        // Also clean up the older 30-min slots from previous runs (if they exist)
        var legacySlots = new (TimeOnly Start, TimeOnly End)[]
        {
          (new TimeOnly(10, 30), new TimeOnly(11, 0)),
          (new TimeOnly(11, 0), new TimeOnly(11, 30)),
          (new TimeOnly(11, 30), new TimeOnly(12, 0)),
        };

        var therapists = await context.PhysicalTherapists
          .Include(pt => pt.User)
          .Where(pt => pt.IsOnboardingComplete &&
                       pt.VerificationStatus == VerificationStatus.Verified &&
                       pt.User.Email != null &&
                       pt.User.Email.EndsWith("@demo.agapay.com") &&
                       pt.RatingCount > 0)
          .OrderByDescending(pt => pt.RatingCount)
          .Take(10)
          .ToListAsync();

        var patients = await context.Patients
          .Include(p => p.User)
          .Where(p => p.IsOnboardingComplete &&
                      p.User.Email != null &&
                      p.User.Email.EndsWith("@demo.agapay.com") &&
                      p.Latitude != null &&
                      p.Longitude != null)
          .OrderBy(p => p.Id)
          .Take(10)
          .ToListAsync();

        if (therapists.Count < 3 || patients.Count < 3)
        {
          logger.LogWarning("[SEED][DEFENSE] Skipping: need at least 3 eligible demo therapists AND 3 eligible demo patients (@demo.agapay.com).");
          return;
        }

        // Remove any existing demo sessions for today's target defense slots so we don't end up with duplicates.
        var slotTimesUtc = slots
          .Select(s => (StartAt: PhtToUtc(defenseDatePht, s.Start), EndAt: PhtToUtc(defenseDatePht, s.End)))
          .ToList();
        var legacyTimesUtc = legacySlots
          .Select(s => (StartAt: PhtToUtc(defenseDatePht, s.Start), EndAt: PhtToUtc(defenseDatePht, s.End)))
          .ToList();

        var allTargetTimesUtc = slotTimesUtc.Concat(legacyTimesUtc).ToList();
        var allTargetStartAtsUtc = allTargetTimesUtc.Select(t => t.StartAt).Distinct().ToList();

        // EF Core can't translate an Any() over an in-memory list of (StartAt, EndAt) tuples reliably.
        // So we fetch candidates by StartAt (IN list) and then do the exact (StartAt, EndAt) match in-memory.
        var candidateTargetSessions = await context.TherapySessions
          .Include(s => s.Patient!).ThenInclude(p => p.User)
          .Include(s => s.PhysicalTherapist!).ThenInclude(pt => pt.User)
          .Where(s => allTargetStartAtsUtc.Contains(s.StartAt) &&
                      s.Patient != null && s.PhysicalTherapist != null &&
                      s.Patient.User.Email != null && s.Patient.User.Email.EndsWith("@demo.agapay.com") &&
                      s.PhysicalTherapist.User.Email != null && s.PhysicalTherapist.User.Email.EndsWith("@demo.agapay.com"))
          .ToListAsync();

        var existingTargetSessions = candidateTargetSessions
          .Where(s => allTargetTimesUtc.Any(t => t.StartAt == s.StartAt && t.EndAt == s.EndAt))
          .ToList();

        // If the 3 main slots already exist and are unique pairs, we can skip.
        var existingMain = existingTargetSessions
          .Where(s => slotTimesUtc.Any(t => t.StartAt == s.StartAt && t.EndAt == s.EndAt))
          .ToList();

        var hasAllMainSlots = existingMain.Count == 3 &&
          slotTimesUtc.All(t => existingMain.Any(s => s.StartAt == t.StartAt && s.EndAt == t.EndAt));

        var uniquePairsCount = existingMain
          .Select(s => (s.PatientId, s.PhysicalTherapistId))
          .Distinct()
          .Count();

        if (hasAllMainSlots && uniquePairsCount == 3)
        {
          logger.LogInformation("[SEED][DEFENSE] Defense demo sessions already exist with different pairs; nothing to do.");
          return;
        }

        if (existingTargetSessions.Count > 0)
        {
          context.TherapySessions.RemoveRange(existingTargetSessions);
          await context.SaveChangesAsync();
          logger.LogInformation("[SEED][DEFENSE] Replaced {Count} existing demo session(s) in the defense slots.", existingTargetSessions.Count);
        }

        // Create one distinct pair per slot (therapists[0..2] with patients[0..2]).
        var createdCount = 0;
        for (var i = 0; i < slots.Length; i++)
        {
          var slot = slots[i];
          var therapist = therapists[i];
          var patient = patients[i];

          var fee = therapist.FeePerSession ?? 1000m;
          var startUtc = PhtToUtc(defenseDatePht, slot.Start);
          var endUtc = PhtToUtc(defenseDatePht, slot.End);
          var durationMinutes = (int)Math.Round((endUtc - startUtc).TotalMinutes);

          var contract = await context.Contracts
            .Where(c => c.PatientId == patient.Id &&
                        c.PhysicalTherapistId == therapist.Id &&
                        c.Status == ContractStatus.Active)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync();

          if (contract == null)
          {
            contract = new Contract
            {
              PatientId = patient.Id,
              PhysicalTherapistId = therapist.Id,
              StartDate = startUtc,
              EndDate = startUtc.AddDays(30),
              Status = ContractStatus.Active,
              CreatedAt = nowUtc,
              TotalFee = fee,
              ProfessionalFee = fee,
              LocationFee = 0m,
              MiscellaneousFee = 0m,
              BlueprintConfirmedAt = nowUtc,
            };

            context.Contracts.Add(contract);
            await context.SaveChangesAsync();
          }

          var existingMaxSessionNumber = await context.TherapySessions
            .Where(s => s.ContractId == contract.Id)
            .Select(s => (int?)s.SessionNumber)
            .MaxAsync() ?? 0;

          context.TherapySessions.Add(new TherapySession
          {
            ContractId = contract.Id,
            PhysicalTherapistId = therapist.Id,
            PatientId = patient.Id,
            LocationAddress = patient.Address ?? patient.Barangay,
            Latitude = patient.Latitude,
            Longitude = patient.Longitude,
            StartAt = startUtc,
            EndAt = endUtc,
            DurationMinutes = durationMinutes,
            TotalFee = fee,
            PatientFee = fee,
            Status = SessionStatus.Scheduled,
            CreatedAt = nowUtc,
            SessionNumber = existingMaxSessionNumber + 1,
            DetailsConfirmedAt = nowUtc,
            IsRescheduled = false,
            IsRelieverProposed = false,
          });

          createdCount++;
          logger.LogInformation("{Message}", $"[SEED][DEFENSE] {slot.Label}: {slot.Start:hh\\:mm}-{slot.End:hh\\:mm} PHT | patient={patient.User.Email} | therapist={therapist.User.Email}");
        }

        await context.SaveChangesAsync();
        logger.LogInformation("[SEED][DEFENSE] Created {Count} defense demo session(s) for {DefenseDate} (PHT) with different pairs.", createdCount, defenseDatePht);
      }
      catch (Exception ex)
      {
        logger.LogError(ex, "[SEED][DEFENSE] Failed to seed defense demo sessions.");
      }
    }

    private static async Task SeedSpecializations(agapayDbContext context)
    {
      if (!context.Specializations.Any())
      {
        var specializations = new[]
        {
                    "Orthopedic/Musculoskeletal",
                    "Pediatric",
                    "Geriatric",
                    "Neurological",
                    "Sports",
                    "Cardiopulmonary",
                    "Vestibular",
                };

        foreach (var specialization in specializations)
        {
          context.Specializations.Add(new Specialization { Name = specialization });
        }

        await context.SaveChangesAsync();
      }
    }

    private static async Task SeedConditionsTreated(agapayDbContext context)
    {
      if (!context.ConditionsTreated.Any())
      {
        var groupedConditions = new Dictionary<ConditionCategory, string[]>
        {
          [ConditionCategory.Cardiopulmonary] = new[]
            {
                        "Chronic Obstructive Pulmonary Disease",
                        "Asthma with exercise limitation",
                        "Pneumonia recovery and breathing rehabilitation",
                        "Post-COVID or post-viral deconditioning",
                        "Chronic bronchitis",
                        "Cystic fibrosis",
                        "Pulmonary fibrosis",
                        "Recovery after thoracic surgery",
                        "Congestive heart failure",
                        "Myocardial infarction recovery",
                        "Coronary artery disease",
                        "Recovery after heart surgery",
                        "Peripheral artery disease",
                        "Exercise intolerance due to low endurance",
                        "Weakness after prolonged bed rest or ICU stay"
                    },
          [ConditionCategory.Geriatric] = new[]
            {
                        "Osteoarthritis",
                        "Rheumatoid arthritis functional rehabilitation",
                        "Osteoporosis",
                        "Sarcopenia",
                        "Frailty",
                        "Balance disorders",
                        "Gait abnormalities",
                        "Post-fracture rehabilitation",
                        "Rehabilitation after hip or knee replacement",
                        "Chronic low back pain",
                        "Spinal stenosis",
                        "Degenerative disc disease",
                        "Parkinson's disease mobility rehabilitation",
                        "Alzheimer's disease mobility training",
                        "Post-stroke rehabilitation for older adults",
                        "Generalized weakness and deconditioning"
                    },
          [ConditionCategory.Neurological] = new[]
            {
                        "Stroke",
                        "Traumatic brain injury",
                        "Spinal cord injury",
                        "Parkinson's disease",
                        "Multiple sclerosis",
                        "Cerebral palsy",
                        "Peripheral neuropathy",
                        "Peripheral nerve injuries",
                        "Cervical or lumbar radiculopathy",
                        "Sciatica",
                        "Bell's Palsy",
                        "Peripheral Nerve Injury (e.g. Carpal Tunnel Syndrome)",
                        "Multiple Sclerosis"
                    },
          [ConditionCategory.Musculoskeletal] = new[]
            {
                        "Frozen Shoulder/Adhesive Capsulitis",
                        "Fracture",
                        "Scoliosis",
                        "Myofascial Pain Syndrome",
                        "Low Back Pain",
                        "Sprain/Strain",
                        "Ligament Tears (ACL, PCL, MCL)",
                        "Patellofemoral Pain Syndrome",
                        "Plantar Fasciitis",
                        "Tendonitis",
                        "Bursitis",
                        "Muscle Strains"
                    },
          [ConditionCategory.Orthopedic] = new[]
            {
                        "Total Hip Replacement",
                        "Total Knee Replacement",
                        "Rotator Cuff Injuries",
                        "Anterior Cruciate Ligament (ACL) Injuries",
                        "Meniscus Injuries",
                        "Shoulder Dislocation",
                        "Hip Fracture",
                        "Ankle Fracture",
                        "Vertebral Compression Fracture",
                        "Joint Arthroplasty",
                        "Spinal Fusion",
                        "Lumbar Disc Herniation"
                    },
          [ConditionCategory.Sports] = new[]
            {
                        "ACL Injury",
                        "Meniscus Tear",
                        "Rotator Cuff Tear",
                        "Tennis Elbow (Lateral Epicondylitis)",
                        "Golfer's Elbow (Medial Epicondylitis)",
                        "Achilles Tendinitis",
                        "Shin Splints",
                        "Runner's Knee",
                        "Hamstring Strain",
                        "Groin Pull",
                        "Concussion",
                        "Ankle Sprain",
                        "Shoulder Impingement Syndrome"
                    },
          [ConditionCategory.Pediatric] = new[]
            {
                        "Global Developmental Delay",
                        "Cerebral Palsy",
                        "Spina Bifida",
                        "Down Syndrome",
                        "Torticollis",
                        "Plagiocephaly"
                    },
          [ConditionCategory.Geriatric] = new[]
            {
                        "Arthritis",
                        "Osteoarthritis",
                        "Deconditioning and Generalized Weakness",
                        "Gait and Balance Problem",
                        "Parkinson's Disease",
                        "Osteoporosis",
                        "Hip Fracture",
                        "Fall Prevention"
                    },
          [ConditionCategory.Cardiopulmonary] = new[]
            {
                        "Chronic Obstructive Pulmonary Disease (COPD)",
                        "Asthma",
                        "Pneumonia",
                        "Congestive Heart Failure",
                        "Coronary Artery Disease",
                        "Post-Cardiac Surgery Rehabilitation",
                        "Pulmonary Fibrosis",
                        "Bronchiectasis",
                        "Cystic Fibrosis",
                        "Post-COVID-19 Respiratory Complications"
                    },
          [ConditionCategory.Vestibular] = new[]
            {
                        "Benign Paroxysmal Positional Vertigo (BPPV)",
                        "Vestibular Neuritis",
                        "Labyrinthitis",
                        "Meniere's Disease",
                        "Vestibular Migraine",
                        "Persistent Postural-Perceptual Dizziness (PPPD)",
                        "Bilateral Vestibular Hypofunction",
                        "Unilateral Vestibular Hypofunction",
                        "Superior Canal Dehiscence Syndrome",
                        "Cervicogenic Dizziness",
                        "Post-Concussion Syndrome with vestibular symptoms",
                        "Age-related Balance Disorders",
                        "Vestibular Schwannoma (Acoustic Neuroma) rehabilitation",
                        "Mal de Debarquement Syndrome",
                        "Motion Sensitivity"
                    }
        };

        foreach (var kvp in groupedConditions)
        {
          foreach (var condition in kvp.Value)
          {
            context.ConditionsTreated.Add(new ConditionTreated { Name = condition, Category = kvp.Key });
          }
        }

        await context.SaveChangesAsync();
      }
    }

    private static async Task SeedServiceAreas(agapayDbContext context)
    {
      if (!context.ServiceAreas.Any())
      {
        var barangays = new[]
        {
                     "Mintal", "Buhangin", "Roxas", "Agdao", "Paquibato", "Toril", "Tugbok",
                    "Calinan", "Baguio", "Cabantian", "Matina", "Talomo", "Poblacion",
                    "San Pedro", "Tibungco", "Catalunan Grande", "Catalunan Peque�o",
                    "Ma-a", "Bunawan", "Lasang", "Dumoy", "Bago Aplaya", "Tacunan",
                    "Ilang", "Waan", "Suba", "Lamanan", "Tamugan", "Marilog",
                    "Baracatan", "Carmen", "Communal", "Leon Garcia", "Langub",
                    "Malamba", "New Carmen", "Santo Tomas", "Sibulan", "Tampakan",
                    "Talandang", "Mudiang", "Daliaon", "Mandug", "Datu Salumay",
                    "Biao Joaquin", "Biao Guianga", "Kilate", "Crossing Bayabas",
                    "Sto. Ni�o", "Gumitan", "Pangyan", "Inayawan", "Magtuod",
                    "Arancia", "Buda", "Dalagdag", "Lacson", "Magsaysay",
                    "Malabog", "Marapangi", "Paradise Embac", "Riverside",
                    "Salapawan", "Subasta", "Vicente Hizon Sr.", "Wines",
                    "19-B", "21-C", "22-C", "23-C", "24-C", "25-C", "26-C",
                    "27-C", "28-C", "29-C", "30-C", "31-D", "32-D", "33-D",
                    "34-D", "35-D", "36-D", "37-D", "38-D", "39-D", "40-D",
                    "1-A", "2-A", "3-A", "4-A", "5-A", "6-A", "7-A", "8-A",
                    "9-A", "10-A", "11-B", "12-B", "13-B", "14-B", "15-B",
                    "16-B", "17-B", "18-B"
                };

        foreach (var barangay in barangays)
        {
          context.ServiceAreas.Add(new ServiceArea { Name = barangay });
        }

        await context.SaveChangesAsync();
      }
    }

    private static async Task SeedRecommendationDemoData(agapayDbContext context, UserManager<User> userManager, ILogger logger)
    {
       logger.LogInformation("[SEED] Starting SeedRecommendationDemoData...");
       try
       {
           var conn = context.Database.GetDbConnection();
           logger.LogInformation("[SEED] Database Host: {DataSource}", conn.DataSource);
           logger.LogInformation("[SEED] Database Name: {Database}", conn.Database);
       }
       catch (Exception ex) { logger.LogError(ex, "[SEED] Could not print connection info: {Message}", ex.Message); }
       // Diagnostic: List ALL users at the start
       var allUsers = await userManager.Users.Select(u => new { u.UserName, u.Email }).ToListAsync();
       logger.LogInformation("[SEED] Total users in DB: {Count}", allUsers.Count);
       foreach (var u in allUsers.Take(20)) logger.LogInformation("  - User: {UserName} ({Email})", u.UserName, u.Email);
       if (allUsers.Count > 20) logger.LogInformation("  - ... and more");

       // --- 0. PRE-FLIGHT CHECK ---
       var ptCount = await context.PhysicalTherapists.CountAsync();
       var pCount = await context.Patients.CountAsync();
       var sessionCount = await context.TherapySessions.CountAsync();
       logger.LogInformation("[SEED] Current counts: PTs={PtCount}, Patients={PatientCount}, Sessions={SessionCount}", ptCount, pCount, sessionCount);

       if (ptCount >= 50 && pCount >= 100 && sessionCount >= 300)
       {
           logger.LogInformation("[SEED] Skip threshold met (PTs={PtCount}, Patients={PatientCount}, Sessions={SessionCount}). Exiting.", ptCount, pCount, sessionCount);
           return;
       }

       // --- 0. Cleanup Legacy Data ---
       // Use simpler patterns that translate well to SQL
       // --- 0. NUCLEAR CLEANUP ---
       // Delete anything that looks like seed data.
       var legacyUsers = await userManager.Users
           .Where(u => (u.Email.EndsWith("@demo.agapay.com") || 
                        u.UserName.Contains("Rater") || 
                        u.UserName.Contains("-DEMO") ||
                        u.UserName.Contains("PT-")) 
                        && u.UserName != "admin@demo.agapay.com") 
           .ToListAsync();

       logger.LogInformation("[SEED] Found {Count} potential legacy users.", legacyUsers.Count);

       if (legacyUsers.Any())
       {
           var legacyUserIds = legacyUsers.Select(u => u.Id).ToList();
           logger.LogInformation("[SEED] Cleaning up data for {Count} users...", legacyUserIds.Count);

           // 1. Find Patients linked to these users
           var patientsToDelete = await context.Patients
               .Where(p => legacyUserIds.Contains(p.UserId))
               .ToListAsync();
           
           if (patientsToDelete.Any())
           {
               var patientIds = patientsToDelete.Select(p => p.Id).ToList();
               logger.LogInformation("[SEED] Deleting {PatientCount} Patients, {PatientIdCount} patient IDs involved.", patientsToDelete.Count, patientIds.Count);
               
               // Delete related Sessions, Contracts, Ratings, Preferences
               var sessions = await context.TherapySessions.Where(s => patientIds.Contains(s.PatientId)).ToListAsync();
               logger.LogInformation("[SEED] Removing {Count} sessions...", sessions.Count);
               context.TherapySessions.RemoveRange(sessions);
               
               var ratings = await context.TherapistRatings.Where(r => patientIds.Contains(r.PatientId)).ToListAsync();
               logger.LogInformation("[SEED] Removing {Count} ratings...", ratings.Count);
               context.TherapistRatings.RemoveRange(ratings);

               var contracts = await context.Contracts.Where(c => patientIds.Contains(c.PatientId)).ToListAsync();
               logger.LogInformation("[SEED] Removing {Count} contracts...", contracts.Count);
               context.Contracts.RemoveRange(contracts);

               // Preferences usually cascade, but good to be safe if not
               var prefs = await context.PatientPreferences.Where(p => patientIds.Contains(p.PatientId)).ToListAsync();
               logger.LogInformation("[SEED] Removing {Count} preferences...", prefs.Count);
               context.PatientPreferences.RemoveRange(prefs);

               context.Patients.RemoveRange(patientsToDelete);
               await context.SaveChangesAsync();
               logger.LogInformation("[SEED] Saved patient-related cleanup.");
           }

           // 2. Find Therapists linked to these users
           var therapistsToDelete = await context.PhysicalTherapists
               .Where(pt => legacyUserIds.Contains(pt.UserId))
               .ToListAsync();

           if (therapistsToDelete.Any())
           {
               var ptIds = therapistsToDelete.Select(p => p.Id).ToList();
               // Most session/contract/rating logic handled above by Patient deletion if they were paired.
               // But check for any remaining items where these PTs are involved (e.g. matched with non-legacy patients?)
               // Since assuming legacy data is self-contained or we want to wipe it all:
               
               var orphanedSessions = await context.TherapySessions.Where(s => ptIds.Contains(s.PhysicalTherapistId)).ToListAsync();
               context.TherapySessions.RemoveRange(orphanedSessions);
               
               var orphanedContracts = await context.Contracts.Where(c => ptIds.Contains(c.PhysicalTherapistId)).ToListAsync();
               context.Contracts.RemoveRange(orphanedContracts);
               
               // Availabilities
               var availabilities = await context.TherapistAvailabilities.Where(a => ptIds.Contains(a.PhysicalTherapistId)).ToListAsync();
               context.TherapistAvailabilities.RemoveRange(availabilities);

               context.PhysicalTherapists.RemoveRange(therapistsToDelete);
               await context.SaveChangesAsync();
           }

           // 3. Finally Delete Users
           foreach (var u in legacyUsers)
           {
               logger.LogInformation("[SEED] Deleting Identity User: {UserName} ({Email})", u.UserName, u.Email);
               try { await userManager.DeleteAsync(u); } catch (Exception ex) { logger.LogError(ex, "[SEED] Failed to delete user {UserName}: {Message}", u.UserName, ex.Message); }
           }
       }
       else
       {
           logger.LogInformation("[SEED] No legacy users found matching the filter.");
       }

       // Double check for any remaining artifacts
       var remainingDemo = await context.Users.Where(u => u.Email.EndsWith("@demo.agapay.com") && u.UserName != "admin@demo.agapay.com").CountAsync();
       if (remainingDemo > 0) logger.LogWarning("[SEED] WARNING: {Count} demo users still exist after cleanup!", remainingDemo);

      var rand = new Random();

      // --- 2. Reference Data Fetching ---
      var specializationsDict = await context.Specializations.ToDictionaryAsync(s => s.Name);
      var serviceAreasList = await context.ServiceAreas.ToListAsync();
      var conditionsList = await context.ConditionsTreated.ToListAsync();

      if (!specializationsDict.Any() || !serviceAreasList.Any()) return;

      // --- 3. Name & Data Lists ---
      var firstNames = new[] {
                "Juan", "Ana", "Miguel", "Sofia", "Carlos", "Isabella", "Jose", "Gabriela", "Antonio", "Lucia",
                "Pedro", "Carmen", "Rafael", "Elena", "Manuel", "Teresa", "Francisco", "Rosa", "David", "Patricia",
                "Ricardo", "Angela", "Eduardo", "Cristina", "Fernando", "Victoria", "Roberto", "Beatriz", "Andres", "Monica",
                "Gabriel", "Andrea", "Daniel", "Claudia", "Luis", "Veronica", "Jorge", "Vanessa", "Ramon", "Natalia",
                "Oscar", "Stephanie", "Ernesto", "Michelle", "Arturo", "Nicole", "Ruben", "Katherine", "Enrique", "Samantha",
                "Marco", "Jasmine", "Alberto", "Grace", "Vincent", "Faith", "Dominic", "Joy", "Bryan", "Hope",
                "Christian", "Clarissa", "Jerome", "Bianca", "Patrick", "Trisha", "Kenneth", "Kimberly", "Ronald", "Jessica",
                "Raymond", "Angelica", "Gerald", "Maricel", "Dennis", "Joanna", "Rodel", "Maricris", "Jayson", "Rochelle",
                "Mark", "Cherry", "Paul", "Lovely", "John", "Princess", "James", "Angel", "Kevin", "Divine",
                "Ryan", "Precious", "Alvin", "Girlie", "Arnel", "Rowena", "Joel", "Liza", "Rey", "Mila"
            };

      var dNames = new[] {
                "Dante", "Daria", "Dario", "Dawn", "David", "Daisy", "Daniel", "Dana", "Dominic", "Diana",
                "Diego", "Denise", "Dennis", "Dahlia", "Drew", "Demi", "Dean", "Dex", "Divine", "Doreen",
                "Dylan", "Dorothy", "Dustin", "Dianne", "Douglas", "Debbie", "Duke", "Donna", "Denver", "Dolly",
                "Damian", "Danica", "Darius", "Darlene", "Darwin", "Dwyn", "Derrick", "Desiree", "Dexter", "Deanna"
            };

      var lastNames = new[] {
                "Dela Cruz", "Reyes", "Santos", "Garcia", "Mendoza", "Torres", "Flores", "Gonzales", "Bautista", "Villanueva",
                "Ramos", "Aquino", "Castro", "Fernandez", "Lopez", "Diaz", "Morales", "Rivera", "Cruz", "Perez",
                "Rodriguez", "Martinez", "Hernandez", "Gomez", "Pascual", "Salazar", "De Leon", "Soriano", "Manalo", "Estrada",
                "Salvador", "Navarro", "Zamora", "Aguilar", "Jimenez", "Valdez", "Espinosa", "Medina", "Del Rosario", "Velasco",
                "Corpuz", "Villena", "Tolentino", "Lacson", "Galang", "Dimaculangan", "Panganiban", "Magpantay", "Canlas", "Ocampo",
                "Domingo", "Vega", "Serrano", "Marquez", "Padilla", "Gutierrez", "Mercado", "Miranda", "Rosales", "Tan",
                "Lim", "Ong", "Chua", "Sy", "Go", "Co", "Yu", "Dy", "Ang", "Uy",
                "Catalan", "Labrador", "Maceda", "Pangilinan", "Bello", "Ignacio", "Lazaro", "Sison", "Cabrera", "Buenaventura",
                "Mallari", "Pineda", "David", "Dizon", "De Guzman", "Roxas", "Crisostomo", "Magtanggol", "Legaspi", "Santiago",
                "Enriquez", "Concepcion", "Suarez", "Almonte", "Villareal", "Coronel", "De Castro", "Laurel", "Abad", "Cunanan"
            };

      var occupations = new[] {
          "Engineer", "Teacher", "Nurse", "Accountant", "Student", "Business Owner", 
          "Freelancer", "Retired", "Government Employee", "Call Center Agent", "Architect",
          "Chef", "Driver", "Sales Representative", "Manager"
      };

      var activityLevels = new[] {
          "Sedentary", "Lightly Active", "Moderately Active", "Very Active", "Extremely Active"
      };

      // Cancellation Reasons (Labels)
      var patientCancellationReasons = new[] {
              "Feeling unwell", "Home is not available", "Caregiver/family member unavailable",
              "Personal/family emergency", "Schedule conflict", "Financial reasons", "Other"
            };

      var therapistCancellationReasons = new[] {
               "Personal emergency", "Feeling unwell", "Transportation/travel issues",
               "Weather conditions", "Patient is unreachable", "Safety concerns", "Other"
            };

      // --- 4. Helpers ---
      string GetRandomName(string[] source) => source[rand.Next(source.Length)];

      (string firstName, string lastName) GenerateName()
      {
        var fn = GetRandomName(firstNames);
        var dn = GetRandomName(dNames);
        var ln = GetRandomName(lastNames);
        return ($"{fn} {dn}", ln);
      }

      (double lat, double lng) GetBarangayCoordinates(string barangay)
      {
          // Base coordinates for major areas
          var centers = new Dictionary<string, (double, double)>(StringComparer.OrdinalIgnoreCase)
          {
              { "Mintal", (7.108, 125.503) },
              { "Buhangin", (7.115, 125.617) },
              { "Matina", (7.058, 125.560) },
              { "Toril", (7.018, 125.485) },
              { "Agdao", (7.085, 125.630) },
              { "Calinan", (7.185, 125.450) },
              { "Bunawan", (7.155, 125.640) },
              { "Cabantian", (7.135, 125.605) },
              { "Catalunan Grande", (7.105, 125.545) },
              { "Ma-a", (7.065, 125.585) },
              { "Panacan", (7.140, 125.650) },
              { "Sasa", (7.120, 125.645) },
              { "Tibungco", (7.170, 125.650) },
              { "Bago Aplaya", (7.035, 125.530) },
              { "Dumoy", (7.045, 125.515) },
              { "Indangan", (7.145, 125.575) },
              { "Mandug", (7.155, 125.585) },
              { "Tugbok", (7.125, 125.495) },
              { "Poblacion", (7.065, 125.609) },
              { "Talomo", (7.050, 125.560) }
          };

          double baseLat, baseLng;
          
          // Check for numbered barangays (x-A, x-B, etc.) -> Map to Poblacion
          if (char.IsDigit(barangay[0]) && barangay.Contains("-")) 
          {
             (baseLat, baseLng) = centers["Poblacion"];
          }
          else 
          {
              // Try to find exact or contains
              var key = centers.Keys.FirstOrDefault(k => barangay.Contains(k, StringComparison.OrdinalIgnoreCase));
              if (key != null)
              {
                  (baseLat, baseLng) = centers[key];
              }
              else
              {
                  // Fallback: Random point around central Davao
                   baseLat = 7.05 + (rand.NextDouble() * 0.10);
                   baseLng = 125.55 + (rand.NextDouble() * 0.10);
              }
          }

          // Add random jitter (~500m-1km radius)
          double jitterLat = (rand.NextDouble() - 0.5) * 0.01;
          double jitterLng = (rand.NextDouble() - 0.5) * 0.01;

          return (baseLat + jitterLat, baseLng + jitterLng);
      }

      async Task<User> EnsureUserAsync(string email, string firstName, string lastName, string roleName)
      {
        var user = await userManager.FindByEmailAsync(email);
        if (user != null) return user;

        user = new User
        {
          UserName = email,
          Email = email,
          FirstName = firstName,
          LastName = lastName,
          DateOfBirth = new DateOnly(rand.Next(1980, 2000), rand.Next(1, 13), rand.Next(1, 28)),
          Gender = rand.Next(2) == 0 ? "Male" : "Female",
          EmailConfirmed = true,
          CreatedAt = DateTime.UtcNow,
          UpdatedAt = DateTime.UtcNow
        };

        var result = await userManager.CreateAsync(user, "Password123!");
        if (!result.Succeeded)
        {
          // In seed data, we might just skip or log. For now, fallback logic? 
          // Just return null if failed? But safer to throw to know why.
          return null; 
        }

        if (!string.IsNullOrWhiteSpace(roleName))
        {
          await userManager.AddToRoleAsync(user, roleName);
        }
        return user;
      }

      async Task<PhysicalTherapist?> CreateTherapistAsync(
          string firstName, string lastName, string licenseNumber,
          Specialization primarySpec, List<Specialization> otherSpecs)
      {
        var email = $"{firstName.Replace(" ", "").ToLower()}.{lastName.Replace(" ", "").ToLower()}@demo.agapay.com";
        var user = await EnsureUserAsync(email, firstName, lastName, "PhysicalTherapist");
        if (user == null) return null;
        
        var gender = rand.Next(2) == 0 ? "Male" : "Female";
        var fee = rand.Next(11, 27) * 50; 

        var therapist = new PhysicalTherapist
        {
          UserId = user.Id,
          User = user,
          LicenseNumber = licenseNumber,
          VerificationStatus = VerificationStatus.Verified,
          SubmittedAt = DateTime.UtcNow.AddMonths(-2),
          VerifiedAt = DateTime.UtcNow.AddMonths(-2),
          FeePerSession = fee,
          IsOnboardingComplete = true,
          RatingCount = 0,
          AverageRating = null,
          Gender = gender
        };

        therapist.Specializations.Add(primarySpec);
        foreach (var s in otherSpecs) therapist.Specializations.Add(s);

        // Utilize ALL service areas randomly
        var numAreas = rand.Next(10, 20); // Cover more areas
        var areas = serviceAreasList.OrderBy(x => rand.Next()).Take(numAreas).ToList();
        foreach (var area in areas) therapist.ServiceAreas.Add(area);

        // Condition matching logic
        var numConds = rand.Next(5, 11);
        
        bool IsSpecMatch(string specName, ConditionCategory category)
        {
             var catStr = category.ToString();
             if (specName == "Orthopedic/Musculoskeletal")
             {
                 return catStr == "Orthopedic" || catStr == "Musculoskeletal";
             }
             return catStr == specName;
        }

        var conds = conditionsList.Where(c => IsSpecMatch(primarySpec.Name, c.Category) || 
                                             otherSpecs.Any(os => IsSpecMatch(os.Name, c.Category)))
                                  .OrderBy(x => rand.Next())
                                  .Take(numConds)
                                  .ToList();

        if (conds.Count < numConds)
        {
             var remainder = conditionsList.Except(conds).OrderBy(x => rand.Next()).Take(numConds - conds.Count);
             conds.AddRange(remainder);
        }

        foreach (var c in conds) therapist.ConditionsTreated.Add(c);

        context.PhysicalTherapists.Add(therapist);
        
        var days = Enum.GetValues<DayOfWeekEnum>().OrderBy(x => rand.Next()).Take(rand.Next(4, 7)).ToList();
        foreach(var day in days)
        {
            var morning = rand.Next(0, 2) == 1; 
            var afternoon = rand.Next(0, 2) == 1; 
            if (!morning && !afternoon) morning = true; 

            if (morning)
                context.TherapistAvailabilities.Add(new TherapistAvailability 
                { 
                    PhysicalTherapist = therapist, DayOfWeek = day, 
                    StartTime = new TimeOnly(8, 0), EndTime = new TimeOnly(12, 0), IsAvailable = true 
                });
            
            if (afternoon)
                 context.TherapistAvailabilities.Add(new TherapistAvailability 
                { 
                    PhysicalTherapist = therapist, DayOfWeek = day, 
                    StartTime = new TimeOnly(13, 0), EndTime = new TimeOnly(17, 0), IsAvailable = true 
                });
        }
        
        return therapist;
      }

      // --- 5. Generate Therapists ---
      var therapists = await context.PhysicalTherapists.Include(t => t.User).ToListAsync();
      if (therapists.Count < 50)
      {
          var specDistribution = new Dictionary<string, int> {
              { "Orthopedic/Musculoskeletal", 12 }, { "Sports", 8 }, { "Neurological", 8 },
              { "Geriatric", 8 }, { "Pediatric", 7 }, { "Cardiopulmonary", 7 }
          };

          int licenseCounter = 1000000;
          bool isFirstTherapist = !therapists.Any();

          foreach (var kvp in specDistribution)
          {
              if (!specializationsDict.TryGetValue(kvp.Key, out var primarySpec)) continue;

              for (int i = 0; i < kvp.Value; i++)
              {
                  string fn, ln;
                  if (isFirstTherapist)
                  {
                      fn = "Eduardo Dana";
                      ln = "Co";
                      isFirstTherapist = false;
                  }
                  else
                  {
                      var nameTuple = GenerateName();
                      fn = nameTuple.firstName;
                      ln = nameTuple.lastName;
                  }
                  // Add other specs
                  var otherSpecs = specializationsDict.Values
                      .Where(s => s.Name != kvp.Key).OrderBy(x => rand.Next())
                      .Take(rand.Next(1, 3)).ToList();

                  var pt = await CreateTherapistAsync(fn, ln, licenseCounter++.ToString("D7"), primarySpec, otherSpecs);
                  if (pt != null) therapists.Add(pt);
              }
          }
          await context.SaveChangesAsync();
      }
      logger.LogInformation("[SEED] Therapists available: {Count}", therapists.Count);

      // --- 6. Generate Patients ---
      var patients = await context.Patients.Include(p => p.User).ToListAsync();
      if (patients.Count < 100)
      {
          bool isFirstPatient = !patients.Any();
          for (int i = patients.Count; i < 100; i++)
          {
              string fn, ln;
              if (isFirstPatient)
              {
                  fn = "Juan Dana";
                  ln = "Dela Cruz";
                  isFirstPatient = false;
              }
              else
              {
                  var nameTuple = GenerateName();
                  fn = nameTuple.firstName;
                  ln = nameTuple.lastName;
              }
              var email = $"{fn.Replace(" ", "").ToLower()}.{ln.Replace(" ", "").ToLower()}@demo.agapay.com";
              
              if (await userManager.FindByEmailAsync(email) != null) continue;

              var user = await EnsureUserAsync(email, fn, ln, "Patient");
              if (user == null) continue;

              // Randomize from ALL service areas
              var barangay = serviceAreasList[rand.Next(serviceAreasList.Count)].Name;
              var (lat, lng) = GetBarangayCoordinates(barangay);
              
              var patient = new Patient
              {
                  UserId = user.Id,
                  User = user,
                  FirstName = fn,
                  LastName = ln,
                  DateOfBirth = new DateOnly(rand.Next(1960, 2005), 1, 1),
                  RelationshipToUser = "Self",
                  Gender = rand.Next(2) == 0 ? "Male" : "Female",
                  IsActive = true,
                  IsOnboardingComplete = true,
                  Barangay = barangay,
                  Address = $"Block {rand.Next(1, 99)} Lot {rand.Next(1, 99)}, {barangay}, Davao City",
                  Latitude = lat,
                  Longitude = lng,
                  Occupation = GetRandomName(occupations),
                  ActivityLevel = GetRandomName(activityLevels)
              };
              
              patient.Preferences = new PatientPreferences
              {
                  Patient = patient,
                  PreferredStartTime = new TimeOnly(8, 0),
                  PreferredEndTime = new TimeOnly(18, 0),
                  SessionBudget = 1000m,
                  PreferredSpecialization = "Orthopedic/Musculoskeletal", 
                  PreferredBarangay = patient.Barangay,
                  PreferredTherapistGender = "Any"
              };
              patient.Preferences.PreferredDays.Add(new PatientPreferredDay { PatientPreferences = patient.Preferences, DayOfWeek = DayOfWeekEnum.Monday });
              
              context.Patients.Add(patient);
              patients.Add(patient);
          }
          await context.SaveChangesAsync();
      }
      logger.LogInformation("[SEED] Patients available: {Count}", patients.Count);

      // --- 7. Generate Sessions/Contracts ---
      int totalSessions = 400;
      int completedCount = (int)(totalSessions * 0.65); // 260 completed
      int upcomingCount = (int)(totalSessions * 0.20);  // 80 upcoming scheduled
      int patientCancelledCount = (int)(totalSessions * 0.10); // 40 cancelled
      int therapistCancelledCount = totalSessions - completedCount - upcomingCount - patientCancelledCount; // 20 cancelled

      var allOps = new List<string>(totalSessions);
      allOps.AddRange(Enumerable.Repeat("Completed", completedCount));
      allOps.AddRange(Enumerable.Repeat("Upcoming", upcomingCount));
      allOps.AddRange(Enumerable.Repeat("PatientCancelled", patientCancelledCount));
      allOps.AddRange(Enumerable.Repeat("TherapistCancelled", therapistCancelledCount));
      allOps = allOps.OrderBy(x => rand.Next()).ToList(); 

      foreach (var op in allOps)
      {
          if (!patients.Any() || !therapists.Any()) break;

          var patient = patients[rand.Next(patients.Count)];
          var therapist = therapists[rand.Next(therapists.Count)];
          var fee = therapist.FeePerSession ?? 1000m;

          if (op == "Upcoming")
          {
              var contract = new Contract
              {
                  Patient = patient,
                  PhysicalTherapist = therapist,
                  Status = ContractStatus.Active,
                  StartDate = DateTime.UtcNow.AddDays(-5),
                  EndDate = DateTime.UtcNow.AddDays(25),
                  TotalFee = fee,
                  ProfessionalFee = fee,
                  BlueprintConfirmedAt = DateTime.UtcNow.AddDays(-5)
              };
              context.Contracts.Add(contract);

              var daysAhead = rand.Next(1, 14);
              var futureDate = DateTime.UtcNow.Date.AddDays(daysAhead);
              var startAt = new DateTime(futureDate.Year, futureDate.Month, futureDate.Day, rand.Next(9, 16), 0, 0, DateTimeKind.Utc);
              var endAt = startAt.AddHours(1);

              var session = new TherapySession
              {
                  Contract = contract,
                  PhysicalTherapistId = therapist.Id,
                  PatientId = patient.Id,
                  StartAt = startAt,
                  EndAt = endAt,
                  DurationMinutes = 60,
                  TotalFee = fee,
                  PatientFee = fee,
                  ProfessionalFee = fee,
                  LocationAddress = patient.Address ?? patient.Barangay,
                  Latitude = patient.Latitude,
                  Longitude = patient.Longitude,
                  Status = SessionStatus.Scheduled,
                  DetailsConfirmedAt = DateTime.UtcNow
              };
              context.TherapySessions.Add(session);
          }
          else if (op == "Completed")
          {
              var contract = new Contract
              {
                  Patient = patient,
                  PhysicalTherapist = therapist,
                  Status = ContractStatus.Completed, 
                  StartDate = DateTime.UtcNow.AddMonths(-3),
                  EndDate = DateTime.UtcNow.AddMonths(-1),
                  TotalFee = fee,
                  ProfessionalFee = fee
              };
              context.Contracts.Add(contract);

              var baseDate = DateTime.UtcNow.AddDays(-rand.Next(1, 60));
              var startAt = new DateTime(baseDate.Year, baseDate.Month, baseDate.Day, 10, 0, 0, DateTimeKind.Utc);
              var endAt = startAt.AddHours(1);

              var session = new TherapySession
              {
                   Contract = contract,
                   PhysicalTherapistId = therapist.Id,
                   PatientId = patient.Id,
                   StartAt = startAt,
                   EndAt = endAt,
                   DurationMinutes = 60,
                   TotalFee = fee,
                   PatientFee = fee,
                   ProfessionalFee = fee,
                   LocationAddress = patient.Address ?? patient.Barangay,
                   Latitude = patient.Latitude,
                   Longitude = patient.Longitude,
                   Status = SessionStatus.Completed,
                   DetailsConfirmedAt = startAt.AddHours(-24)
              };
              context.TherapySessions.Add(session);

              // Skew rating high
              var score = rand.Next(1, 101) <= 70 ? 5 : (rand.Next(1, 101) <= 80 ? 4 : rand.Next(3, 6)); 
              
              context.TherapistRatings.Add(new TherapistRating
              {
                  Contract = contract,
                  PhysicalTherapist = therapist,
                  Patient = patient,
                  Score = (byte)score,
                  CreatedAt = DateTime.UtcNow.AddDays(-rand.Next(1, 60))
              });
              
              therapist.RatingCount++;
              double currentTotal = (therapist.AverageRating ?? 0) * (therapist.RatingCount - 1);
              therapist.AverageRating = (currentTotal + score) / therapist.RatingCount;
          }
          else if (op == "PatientCancelled")
          {
              var contract = new Contract
              {
                  Patient = patient,
                  PhysicalTherapist = therapist,
                  Status = ContractStatus.Active, 
                  StartDate = DateTime.UtcNow.AddMonths(-2),
                  EndDate = DateTime.UtcNow.AddMonths(-1),
                  TotalFee = fee,
                  ProfessionalFee = fee
              };
              context.Contracts.Add(contract);

              var baseDate = DateTime.UtcNow.AddDays(-rand.Next(1, 40));
              var startAt = new DateTime(baseDate.Year, baseDate.Month, baseDate.Day, 10, 0, 0, DateTimeKind.Utc);
              var endAt = startAt.AddHours(1);

              var reason = GetRandomName(patientCancellationReasons);
              var session = new TherapySession
              {
                   Contract = contract,
                   PhysicalTherapistId = therapist.Id,
                   PatientId = patient.Id,
                   StartAt = startAt,
                   EndAt = endAt,
                   DurationMinutes = 60,
                   TotalFee = fee,
                   PatientFee = fee,
                   ProfessionalFee = fee,
                   LocationAddress = patient.Address ?? patient.Barangay,
                   Latitude = patient.Latitude,
                   Longitude = patient.Longitude,
                   Status = SessionStatus.Cancelled,
                   PatientCancellationReason = reason,
                   CancellationReason = reason,
                   CancelledBy = CancellationInitiator.Patient,
                   CancelledAt = DateTime.UtcNow
              };
              context.TherapySessions.Add(session);
          }
          else if (op == "TherapistCancelled")
          {
              var contract = new Contract
              {
                  Patient = patient,
                  PhysicalTherapist = therapist,
                  Status = ContractStatus.Active, 
                  StartDate = DateTime.UtcNow.AddMonths(-2),
                  EndDate = DateTime.UtcNow.AddMonths(-1),
                  TotalFee = fee,
                  ProfessionalFee = fee
              };
              context.Contracts.Add(contract);

              var baseDate = DateTime.UtcNow.AddDays(-rand.Next(1, 40));
              var startAt = new DateTime(baseDate.Year, baseDate.Month, baseDate.Day, 10, 0, 0, DateTimeKind.Utc);
              var endAt = startAt.AddHours(1);

              var reason = GetRandomName(therapistCancellationReasons);
              var session = new TherapySession
              {
                   Contract = contract,
                   PhysicalTherapistId = therapist.Id,
                   PatientId = patient.Id,
                   StartAt = startAt,
                   EndAt = endAt,
                   DurationMinutes = 60,
                   TotalFee = fee,
                   PatientFee = fee,
                   ProfessionalFee = fee,
                   LocationAddress = patient.Address ?? patient.Barangay,
                   Latitude = patient.Latitude,
                   Longitude = patient.Longitude,
                   Status = SessionStatus.Cancelled,
                   CancellationReason = reason,
                   CancelledBy = CancellationInitiator.Therapist,
                   CancelledAt = DateTime.UtcNow
              };
              context.TherapySessions.Add(session);
          }
      }
      
       logger.LogInformation("[SEED] Saving all sessions, contracts, and ratings...");
       int saved = await context.SaveChangesAsync();
       logger.LogInformation("[SEED] Database seed completed successfully. Records affected: {Count}", saved);
       logger.LogInformation("[SEED] ========================================================");
       logger.LogInformation("[SEED] PREMIER DEMO ACCOUNTS (Password: Password123!)");
       logger.LogInformation("[SEED] Physical Therapist: eduardodana.co@demo.agapay.com");
       logger.LogInformation("[SEED] Patient:            juandana.delacruz@demo.agapay.com");
       logger.LogInformation("[SEED] Admin:              admin@demo.agapay.com");
       logger.LogInformation("[SEED] ========================================================");
    }
  }
}
