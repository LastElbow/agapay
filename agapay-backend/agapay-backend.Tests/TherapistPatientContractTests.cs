using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace agapay_backend.Tests;

/// <summary>
/// Wire-shape contract tests for the therapist and patient profile endpoints the
/// mobile apps parse (see TESTING.md): the paginated therapist list, therapist
/// detail/by-user/me/me-details/me-photo, patient me/profile-picture, onboarding
/// status, availability + booked slots, the preferences roundtrip with its
/// recommendation precondition, and the therapist ratings list.
/// One AuthApiFactory per class (IClassFixture): tests use unique DemoEmails, so
/// they can safely share the class's InMemory database.
/// </summary>
public class TherapistPatientContractTests : ContractTestBase, IClassFixture<AuthApiFactory>
{
  public TherapistPatientContractTests(AuthApiFactory sharedFactory)
    : base(sharedFactory)
  {
    Client = sharedFactory.CreateClient();
  }

  /// <summary>
  /// Fresh short-lived context over the factory's InMemory store. The long-lived
  /// <see cref="ContractTestBase.Db"/> scope tracks the seeded entities, so state
  /// written by HTTP requests would be shadowed by its identity map — use this
  /// for every DB assertion made AFTER an HTTP call.
  /// </summary>
  private agapayDbContext FreshDb()
    => new(Factory.Services.GetRequiredService<DbContextOptions<agapayDbContext>>());

  private async Task<HttpClient> ClientForAsync(User user)
  {
    var token = await GetAccessTokenAsync(user.Email!);
    return AuthenticatedClient(token);
  }

  private sealed record TherapistSeed(
    User User, PhysicalTherapist Therapist,
    Specialization Specialization, ServiceArea ServiceArea, ConditionTreated Condition);

  /// <summary>
  /// Seeds a verified, onboarding-complete therapist with one specialization,
  /// service area, treated condition and a fee — the minimum the recommendation
  /// engine and the profile screens expect to find.
  /// </summary>
  private async Task<TherapistSeed> SeedVerifiedTherapistAsync(string prefix, decimal fee = 800m)
  {
    var user = await CreateTherapistUserAsync(DemoEmail(prefix)); // verified + onboarding complete
    var therapist = await Db.PhysicalTherapists.SingleAsync(t => t.UserId == user.Id);
    var specialization = new Specialization { Name = $"Sports rehab {Guid.NewGuid():N}" };
    var serviceArea = new ServiceArea { Name = $"Brgy. Test {Guid.NewGuid():N}" };
    var condition = new ConditionTreated { Name = $"Lower back pain {Guid.NewGuid():N}", Category = ConditionCategory.Musculoskeletal };
    Db.Specializations.Add(specialization);
    Db.ServiceAreas.Add(serviceArea);
    Db.ConditionsTreated.Add(condition);
    therapist.FeePerSession = fee;
    therapist.Specializations.Add(specialization);
    therapist.ServiceAreas.Add(serviceArea);
    therapist.ConditionsTreated.Add(condition);
    await Db.SaveChangesAsync();
    return new TherapistSeed(user, therapist, specialization, serviceArea, condition);
  }

  [Fact]
  public async Task TherapistList_ReturnsPaginatedShape()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-list-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-list-therapist");
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync("/api/Therapist?status=verified&page=1&limit=10");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "items", "totalCount", "page", "pageSize", "totalPages", "hasNextPage", "hasPreviousPage");
    Assert.Equal(1, body.GetProperty("page").GetInt32());
    Assert.Equal(10, body.GetProperty("pageSize").GetInt32());
    Assert.True(body.GetProperty("totalCount").GetInt32() >= 1);
    Assert.Equal(JsonValueKind.False, body.GetProperty("hasPreviousPage").ValueKind); // page 1
    // hasNextPage depends on the shared class fixture's total, so freeze it as a bool
    // that is CONSISTENT with page/totalPages rather than a hard-coded value.
    Assert.True(
      body.GetProperty("hasNextPage").ValueKind is JsonValueKind.True or JsonValueKind.False,
      "hasNextPage must serialize as a bool");
    Assert.Equal(
      body.GetProperty("page").GetInt32() < body.GetProperty("totalPages").GetInt32(),
      body.GetProperty("hasNextPage").GetBoolean());
    Assert.Equal(JsonValueKind.Array, body.GetProperty("items").ValueKind);

    AssertFieldsOnEveryItem(body.GetProperty("items"),
      "id", "userId", "name", "profilePictureUrl", "licenseNumber", "gender",
      "averageRating", "ratingCount", "feePerSession", "specializations", "serviceAreas",
      "isOnboardingComplete", "verificationStatus");

    var mine = body.GetProperty("items").EnumerateArray()
      .Single(i => i.GetProperty("id").GetInt32() == seed.Therapist.Id);
    Assert.Equal(seed.User.Id.ToString(), mine.GetProperty("userId").GetString());
    Assert.Equal("Verified", mine.GetProperty("verificationStatus").GetString()); // string enum
    Assert.True(mine.GetProperty("isOnboardingComplete").GetBoolean());
    Assert.Equal(800m, mine.GetProperty("feePerSession").GetDecimal());
    Assert.True(mine.GetProperty("specializations").GetArrayLength() >= 1);
    Assert.Equal(JsonValueKind.String, mine.GetProperty("specializations")[0].ValueKind); // names, not objects
    Assert.True(mine.GetProperty("serviceAreas").GetArrayLength() >= 1);
    Assert.Equal(JsonValueKind.Null, mine.GetProperty("averageRating").ValueKind); // no ratings yet
    Assert.Equal(0, mine.GetProperty("ratingCount").GetInt32());
  }

  [Fact]
  public async Task TherapistDetail_ReturnsShape()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-detail-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-detail-therapist");
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync($"/api/Therapist/{seed.Therapist.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "userId", "name", "profilePictureUrl", "licenseNumber", "gender", "workPhoneNumber",
      "averageRating", "ratingCount", "feePerSession", "specializations", "conditionsTreated", "serviceAreas");
    Assert.Equal(seed.Therapist.Id, body.GetProperty("id").GetInt32());
    Assert.Equal(seed.User.Id.ToString(), body.GetProperty("userId").GetString());
    Assert.False(string.IsNullOrWhiteSpace(body.GetProperty("name").GetString()));
    Assert.Equal(800m, body.GetProperty("feePerSession").GetDecimal());
    Assert.Equal(JsonValueKind.Null, body.GetProperty("workPhoneNumber").ValueKind);
    Assert.Contains(body.GetProperty("conditionsTreated").EnumerateArray(), c => c.GetString() == seed.Condition.Name);
  }

  [Fact]
  public async Task TherapistByUser_ReturnsCamelCaseId()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-byuser-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-byuser-therapist");
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync($"/api/Therapist/by-user/{seed.User.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);

    // The app reads `id ?? Id` — the lowercase id MUST be present and be the therapist PK.
    AssertHasFields(body, "id", "userId", "name", "licenseNumber");
    Assert.Equal(seed.Therapist.Id, body.GetProperty("id").GetInt32());
    Assert.Equal(seed.User.Id.ToString(), body.GetProperty("userId").GetString());
    Assert.Equal(seed.Therapist.LicenseNumber, body.GetProperty("licenseNumber").GetString());
  }

  [Fact]
  public async Task TherapistMe_ReturnsShape()
  {
    var seed = await SeedVerifiedTherapistAsync("tp-me-therapist");
    using var therapist = await ClientForAsync(seed.User);

    var response = await therapist.GetAsync("/api/Therapist/me");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "userId", "name", "licenseNumber", "profilePictureUrl", "averageRating", "ratingCount",
      "feePerSession", "gender", "isOnboardingComplete", "verificationStatus");
    Assert.Equal(seed.Therapist.Id, body.GetProperty("id").GetInt32());
    Assert.Equal(seed.User.Id.ToString(), body.GetProperty("userId").GetString());
    Assert.Equal(seed.Therapist.LicenseNumber, body.GetProperty("licenseNumber").GetString());
    Assert.Equal(800m, body.GetProperty("feePerSession").GetDecimal());
    Assert.True(body.GetProperty("isOnboardingComplete").GetBoolean());
    Assert.Equal("Verified", body.GetProperty("verificationStatus").GetString());
  }

  [Fact]
  public async Task TherapistMeDetails_IncludesIdArrays()
  {
    var seed = await SeedVerifiedTherapistAsync("tp-medetails-therapist");
    using var therapist = await ClientForAsync(seed.User);

    var response = await therapist.GetAsync("/api/Therapist/me/details");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "therapistId", "userId", "firstName", "lastName", "dateOfBirth", "gender", "feePerSession", "otherConditions",
      "specializationIds", "conditionIds", "serviceAreaIds",
      "specializations", "conditions", "serviceAreas");
    Assert.Equal(seed.Therapist.Id, body.GetProperty("therapistId").GetInt32());
    Assert.Contains(seed.Specialization.Id, body.GetProperty("specializationIds").EnumerateArray().Select(i => i.GetInt32()));
    Assert.Contains(seed.Condition.Id, body.GetProperty("conditionIds").EnumerateArray().Select(i => i.GetInt32()));
    Assert.Contains(seed.ServiceArea.Id, body.GetProperty("serviceAreaIds").EnumerateArray().Select(i => i.GetInt32()));
  }

  [Fact]
  public async Task TherapistMePhoto_FieldIsProfilePicture()
  {
    var seed = await SeedVerifiedTherapistAsync("tp-photo-therapist");
    using var therapist = await ClientForAsync(seed.User);

    var response = await therapist.GetAsync("/api/Therapist/me/photo");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);

    // FROZEN QUIRK: the app reads the field named `profilePicture` (NOT profilePictureUrl).
    AssertHasFields(body, "profilePicture");
    Assert.Equal(JsonValueKind.Null, body.GetProperty("profilePicture").ValueKind); // no photo uploaded
    Assert.False(body.TryGetProperty("profilePictureUrl", out _), "me/photo must use profilePicture, not profilePictureUrl");
  }

  [Fact]
  public async Task PatientMe_ReturnsShape()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-me-patient"));
    // Complete onboarding explicitly: the shared seed helper only marks the profile
    // active — an onboarded patient has IsOnboardingComplete = true.
    var seededProfile = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);
    seededProfile.IsOnboardingComplete = true;
    await Db.SaveChangesAsync();
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync("/api/Patient/me");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body,
      "id", "firstName", "lastName", "dateOfBirth", "relationshipToUser", "gender", "address",
      "barangay", "latitude", "longitude", "occupation", "activityLevel", "currentComplaints",
      "isActive", "isOnboardingComplete", "profilePictureUrl");
    Assert.Equal("Patient", body.GetProperty("firstName").GetString());
    Assert.Equal("1990-01-01", body.GetProperty("dateOfBirth").GetString()); // DateOnly wire format
    Assert.Equal("Self", body.GetProperty("relationshipToUser").GetString());
    Assert.True(body.GetProperty("isActive").GetBoolean());
    Assert.True(body.GetProperty("isOnboardingComplete").GetBoolean());

    var profileId = await Db.Patients.Where(p => p.UserId == patientUser.Id).Select(p => p.Id).SingleAsync();
    Assert.Equal(profileId, body.GetProperty("id").GetInt32());
  }

  [Fact]
  public async Task PatientProfilePicture_FieldIsProfilePictureUrl()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-photo-patient"));
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync("/api/Patient/profile-picture");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);

    // ACTUAL SHAPE: a single explicit-null profilePictureUrl (no message wrapper here,
    // unlike the upload endpoint which returns { message, profilePictureUrl }).
    AssertHasFields(body, "profilePictureUrl");
    Assert.Equal(JsonValueKind.Null, body.GetProperty("profilePictureUrl").ValueKind);
    Assert.False(body.TryGetProperty("message", out _), "GET profile-picture must not carry a message field");
  }

  [Fact]
  public async Task OnboardingPatientStatus_ReturnsSelfPatientId()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-onboard-patient"));
    // Complete onboarding explicitly: the shared seed helper only marks the profile
    // active — a finished onboarding has IsOnboardingComplete = true.
    var seededProfile = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);
    seededProfile.IsOnboardingComplete = true;
    await Db.SaveChangesAsync();
    using var patient = await ClientForAsync(patientUser);

    var response = await patient.GetAsync("/api/Onboarding/patient/status");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    AssertHasFields(body, "isPatientOnboardingComplete", "hasSelfProfile", "selfPatientId", "patientsCount");
    Assert.True(body.GetProperty("isPatientOnboardingComplete").GetBoolean());
    Assert.True(body.GetProperty("hasSelfProfile").GetBoolean());

    // FROZEN: selfPatientId is the PATIENT PROFILE id the app uses as the patient id.
    var selfProfileId = await Db.Patients
      .Where(p => p.UserId == patientUser.Id && p.RelationshipToUser == "Self")
      .Select(p => p.Id).SingleAsync();
    Assert.Equal(selfProfileId, body.GetProperty("selfPatientId").GetInt32());
    Assert.True(body.GetProperty("patientsCount").GetInt32() >= 1);
  }

  [Fact]
  public async Task Availability_ListAndBookedSlots()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-avail-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-avail-therapist");
    var monday = new TherapistAvailability
    {
      PhysicalTherapistId = seed.Therapist.Id,
      PhysicalTherapist = seed.Therapist,
      DayOfWeek = DayOfWeekEnum.Monday,
      StartTime = new TimeOnly(9, 0),
      EndTime = new TimeOnly(12, 0),
      IsAvailable = true,
    };
    var tuesday = new TherapistAvailability
    {
      PhysicalTherapistId = seed.Therapist.Id,
      PhysicalTherapist = seed.Therapist,
      DayOfWeek = DayOfWeekEnum.Tuesday,
      StartTime = new TimeOnly(10, 0),
      EndTime = new TimeOnly(11, 0),
      IsAvailable = true,
    };
    var hiddenSlot = new TherapistAvailability
    {
      PhysicalTherapistId = seed.Therapist.Id,
      PhysicalTherapist = seed.Therapist,
      DayOfWeek = DayOfWeekEnum.Wednesday,
      StartTime = new TimeOnly(8, 0),
      EndTime = new TimeOnly(9, 0),
      IsAvailable = false, // unavailable slots must NOT appear in the list
    };
    Db.TherapistAvailabilities.AddRange(monday, tuesday, hiddenSlot);

    var contract = new Contract
    {
      PatientId = (await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id)).Id,
      PhysicalTherapistId = seed.Therapist.Id,
      StartDate = DateTime.UtcNow,
      Status = ContractStatus.Active,
      CaseToTreat = "back pain",
    };
    var session = new TherapySession
    {
      PatientId = contract.PatientId,
      PhysicalTherapistId = seed.Therapist.Id,
      ContractId = contract.Id,
      Contract = contract,
      StartAt = DateTime.UtcNow,
      EndAt = DateTime.UtcNow.AddMinutes(45),
      DurationMinutes = 45,
      Status = SessionStatus.Scheduled,
    };
    Db.Contracts.Add(contract);
    Db.TherapySessions.Add(session);
    await Db.SaveChangesAsync();

    using var patient = await ClientForAsync(patientUser);

    // LIST: raw entity rows (only IsAvailable ones), dayOfWeek as a string enum.
    var list = await patient.GetAsync($"/api/Availability/therapist/{seed.Therapist.Id}");
    Assert.Equal(HttpStatusCode.OK, list.StatusCode);
    var listBody = await GetJsonAsync(list);
    Assert.Equal(JsonValueKind.Array, listBody.ValueKind);
    Assert.Equal(2, listBody.GetArrayLength());
    AssertFieldsOnEveryItem(listBody,
      "id", "physicalTherapistId", "dayOfWeek", "startTime", "endTime", "isAvailable", "specificDate", "notes");
    var first = listBody[0]; // ordered by dayOfWeek then startTime
    Assert.Equal("Monday", first.GetProperty("dayOfWeek").GetString());
    Assert.Equal(seed.Therapist.Id, first.GetProperty("physicalTherapistId").GetInt32());
    Assert.True(first.GetProperty("isAvailable").GetBoolean());
    Assert.StartsWith("09:00", first.GetProperty("startTime").GetString()); // TimeOnly wire string
    Assert.Equal(JsonValueKind.Null, first.GetProperty("specificDate").ValueKind);

    // BOOKED: active session intervals in the requested window.
    var from = Uri.EscapeDataString(DateTime.UtcNow.AddHours(-1).ToString("o"));
    var to = Uri.EscapeDataString(DateTime.UtcNow.AddHours(2).ToString("o"));
    var booked = await patient.GetAsync($"/api/Availability/therapist/{seed.Therapist.Id}/booked?from={from}&to={to}");
    Assert.Equal(HttpStatusCode.OK, booked.StatusCode);
    var bookedBody = await GetJsonAsync(booked);
    Assert.Equal(JsonValueKind.Array, bookedBody.ValueKind);
    Assert.Equal(1, bookedBody.GetArrayLength());
    AssertFieldsOnEveryItem(bookedBody, "startAt", "endAt");
    Assert.Equal(JsonValueKind.String, bookedBody[0].GetProperty("startAt").ValueKind);
  }

  [Fact]
  public async Task Preferences_Roundtrip_ThenRecommendation()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-pref-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-pref-therapist");
    using var patient = await ClientForAsync(patientUser);

    // Precondition: recommendations 409 with a message object until preferences exist.
    var before = await patient.GetAsync("/api/Recommendation/me");
    Assert.Equal(HttpStatusCode.Conflict, before.StatusCode);
    var beforeBody = await GetJsonUncheckedAsync(before);
    AssertHasFields(beforeBody, "message");
    Assert.False(string.IsNullOrWhiteSpace(beforeBody.GetProperty("message").GetString()));

    // ACTUAL accepted shape (PatientPreferencesDto): singular preferredSpecialization string,
    // desiredServices list, availabilities blocks — the spec's preferredSpecializations[]
    // does not exist on the wire.
    var save = await patient.PostAsJsonAsync("/api/Preferences/me", new
    {
      sessionBudget = 1500,
      preferredTherapistGender = "Any",
      availabilities = Array.Empty<object>(),
      desiredServices = new[] { "Back pain therapy" },
    });
    Assert.Equal(HttpStatusCode.OK, save.StatusCode);
    var saveBody = await GetJsonAsync(save);
    AssertHasFields(saveBody, "message");
    Assert.Equal("Preferences saved", saveBody.GetProperty("message").GetString());

    // Roundtrip read: every field the preferences screen parses, even when null.
    var read = await patient.GetAsync("/api/Preferences/me");
    Assert.Equal(HttpStatusCode.OK, read.StatusCode);
    var readBody = await GetJsonAsync(read);
    AssertHasFields(readBody,
      "availabilities", "preferredDayOfWeek", "preferredDaysOfWeek", "preferredStartTime", "preferredEndTime",
      "sessionBudget", "preferredSpecialization", "desiredService", "desiredServices",
      "preferredBarangay", "preferredTherapistGender");
    Assert.Equal(1500m, readBody.GetProperty("sessionBudget").GetDecimal());
    Assert.Equal("Any", readBody.GetProperty("preferredTherapistGender").GetString());
    Assert.Equal("Back pain therapy", readBody.GetProperty("desiredService").GetString());
    Assert.Equal(1, readBody.GetProperty("desiredServices").GetArrayLength());
    Assert.Equal(0, readBody.GetProperty("availabilities").GetArrayLength());
    Assert.Equal(JsonValueKind.Null, readBody.GetProperty("preferredDayOfWeek").ValueKind);

    // Recommendations now resolve; each match carries the full scoring payload.
    var recommendations = await patient.GetAsync("/api/Recommendation/me");
    Assert.Equal(HttpStatusCode.OK, recommendations.StatusCode);
    var recBody = await GetJsonAsync(recommendations);
    Assert.Equal(JsonValueKind.Array, recBody.ValueKind);
    AssertFieldsOnEveryItem(recBody,
      "therapistId", "therapistName", "profilePictureUrl", "matchScore", "tier", "tierLabel", "breakdown",
      "averageRating", "ratingCount", "feePerSession", "specializations", "serviceAreas", "gender");

    var mine = recBody.EnumerateArray().Single(m => m.GetProperty("therapistId").GetInt32() == seed.Therapist.Id);
    Assert.True(mine.GetProperty("matchScore").GetDouble() is >= 0.0 and <= 1.0);
    Assert.Contains(mine.GetProperty("tier").GetString(), new[] { "Recommended", "OtherOption" }); // string enum
    Assert.False(string.IsNullOrWhiteSpace(mine.GetProperty("tierLabel").GetString()));
    var breakdown = mine.GetProperty("breakdown");
    Assert.Equal(JsonValueKind.Object, breakdown.ValueKind);
    AssertHasFields(breakdown, "availability", "rating", "budget", "specialization", "desiredService");
  }

  [Fact]
  public async Task Ratings_TherapistList_Shape()
  {
    var patientUser = await CreatePatientUserAsync(DemoEmail("tp-rating-patient"));
    var seed = await SeedVerifiedTherapistAsync("tp-rating-therapist");
    var patientProfile = await Db.Patients.SingleAsync(p => p.UserId == patientUser.Id);

    // DRIFT (frozen actual): the spec assumed PatientRating rows, but GET /api/Ratings/
    // therapist/{id} reads the TherapistRatings table — seed those instead.
    var contract = new Contract
    {
      PatientId = patientProfile.Id,
      PhysicalTherapistId = seed.Therapist.Id,
      StartDate = DateTime.UtcNow,
      Status = ContractStatus.Completed,
      CaseToTreat = "back pain",
    };
    Db.Contracts.Add(contract);
    await Db.SaveChangesAsync();
    var ratings = new[]
    {
      new TherapistRating
      {
        ContractId = contract.Id, Contract = contract,
        PhysicalTherapistId = seed.Therapist.Id, PhysicalTherapist = seed.Therapist,
        PatientId = patientProfile.Id, Patient = patientProfile,
        Score = 4, Comment = "good", CreatedAt = DateTime.UtcNow.AddMinutes(-2),
      },
      new TherapistRating
      {
        ContractId = contract.Id, Contract = contract,
        PhysicalTherapistId = seed.Therapist.Id, PhysicalTherapist = seed.Therapist,
        PatientId = patientProfile.Id, Patient = patientProfile,
        Score = 5, Comment = "great", CreatedAt = DateTime.UtcNow.AddMinutes(-1),
      },
    };
    Db.TherapistRatings.AddRange(ratings);
    await Db.SaveChangesAsync();

    using var patient = await ClientForAsync(patientUser);
    var response = await patient.GetAsync($"/api/Ratings/therapist/{seed.Therapist.Id}");

    Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    var body = await GetJsonAsync(response);
    Assert.Equal(JsonValueKind.Array, body.ValueKind);
    Assert.Equal(2, body.GetArrayLength());
    AssertFieldsOnEveryItem(body,
      "id", "contractId", "patientId", "patientName", "patientProfilePictureUrl",
      "score", "comment", "createdAt", "caseToTreat");

    // Newest first.
    Assert.Equal(5, body[0].GetProperty("score").GetInt32());
    Assert.Equal("great", body[0].GetProperty("comment").GetString());
    Assert.Equal("Patient Test", body[0].GetProperty("patientName").GetString());
    Assert.Equal(contract.Id, body[0].GetProperty("contractId").GetInt32());
    Assert.Equal("back pain", body[0].GetProperty("caseToTreat").GetString());
    Assert.Equal(4, body[1].GetProperty("score").GetInt32());
    Assert.Equal(JsonValueKind.Null, body[0].GetProperty("patientProfilePictureUrl").ValueKind);
  }
}
