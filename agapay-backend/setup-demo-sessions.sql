-- ============================================================
-- DEMO SESSION SETUP SCRIPT
-- Defense: May 26, 2026 — 11:00 AM - 12:00 PM PHT (UTC+8)
-- 
-- Creates 2 patient-therapist pairs with sessions:
--   Pair A: 10:30-11:30 AM PHT = 02:30-03:30 UTC
--   Pair B: 11:00-12:00 PM PHT = 03:00-04:00 UTC
-- ============================================================

-- First, let's find good therapists (verified, onboarded, have ratings)
-- and patients (onboarded, have barangay/location)

-- STEP 1: Find 2 therapists with the most ratings
SELECT pt."Id", u."Email", u."FirstName", u."LastName", 
       pt."FeePerSession", pt."AverageRating", pt."RatingCount", pt."Gender"
FROM "PhysicalTherapists" pt
JOIN "AspNetUsers" u ON pt."UserId" = u."Id"
WHERE pt."IsOnboardingComplete" = true
  AND pt."VerificationStatus" = 1
  AND u."Email" LIKE '%@demo.agapay.com'
  AND pt."RatingCount" > 0
ORDER BY pt."RatingCount" DESC
LIMIT 5;

-- STEP 2: Find 2 patients with sessions and location data
SELECT p."Id", u."Email", p."FirstName", p."LastName", 
       p."Barangay", p."Address", p."Latitude", p."Longitude"
FROM "Patients" p
JOIN "AspNetUsers" u ON p."UserId" = u."Id"
WHERE p."IsOnboardingComplete" = true
  AND u."Email" LIKE '%@demo.agapay.com'
  AND p."Latitude" IS NOT NULL
  AND p."Longitude" IS NOT NULL
ORDER BY p."Id"
LIMIT 5;
