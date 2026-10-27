# Comprehensive Seed Data

Create realistic demo data for thesis defense with therapists, patients, sessions, cancellations, and ratings.

## Data Summary

| Entity | Count | Purpose |
|--------|-------|---------|
| Physical Therapists | 50 | Recommendation algorithm demo |
| Rater Patients | 100 | Generate ratings + session history + demo use |
| Contracts | ~200 | Patient-therapist relationships |
| TherapySessions | ~400 | Sessions with various statuses |

---

## Proposed Changes

### [MODIFY] [SeedData.cs](file:///d:/Capstone/agapay-backend/agapay-backend/Data/SeedData.cs)

#### Therapist Profiles (50 total)

Each therapist will have:
- **2-3 specializations** (e.g., Orthopedic + Sports)
- **5-8 service areas** (barangays)
- **5-10 conditions treated**
- **Multiple availability slots**: 2-4 time blocks per day
- **Multiple days**: 4-6 days per week

**Specialization Mix:**

| Primary Specialization | Count |
|------------------------|-------|
| Orthopedic/Musculoskeletal | 12 |
| Sports | 8 |
| Neurological | 8 |
| Geriatric | 8 |
| Pediatric | 7 |
| Cardiopulmonary | 7 |

**Fee Range:** ₱550 - ₱1,300 per session

#### Patient Profiles (100 total)
- **Role:** These patients exist to populate the ecosystem.
- **Data Generated per Patient:**
  - **Preferences:** Each will have seeded preferences (location, budget) to test matching.
  - **Session History:** Each will have a mix of 2-5 sessions.
    - some sessions **Completed** (to generate a rating for the therapist).
    - some sessions **Cancelled** (to create a "bad record" or cancellation history).
- **Identification:**
  - Name: "GivenName D. Surname" (e.g. "Maria Dina Santos")
  - Email: `firstname.lastname@demo.agapay.com`

#### Session Distribution (Global)
- **75% Completed**: Normal successful sessions -> produces a Rating.
- **15% Cancelled by Patient**: Creates a "Cancelled by Patient" record (flagging the patient).
- **10% Cancelled by Therapist**: Creates a "Cancelled by Therapist" record.
- All emails: `*@demo.agapay.com`
- All names: Second name starts with "D" (e.g., "Alice Dawn Mendoza")

#### Login Credentials
- **Password:** `Password123!` (for ALL demo accounts)
- **OTP:** Bypassed automatically for `@demo.agapay.com` emails (Config `Seed:BypassOtpForDemoAccounts` is already set). Enter any code or fixed code `123456` if prompted.

---

## Verification

1. Build project: `dotnet build`
2. Start backend to seed data
3. Check database for:
   - 50 therapists
   - 105 patients
   - Sessions with various statuses
   - Ratings on therapists
