using System.Security.Claims;
using agapay_backend.Controllers;
using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Hubs;
using agapay_backend.Services.Sessions;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace agapay_backend.Tests;

public class SessionsControllerRescheduleAcceptanceTests
{
  [Fact]
  public async Task ApproveReschedule_WhenSessionMissing_ReturnsNotFound()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_NotFound_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.ApproveReschedule(sessionId: 999999);

    Assert.IsType<NotFoundResult>(result);
  }

  [Fact]
  public async Task ApproveReschedule_WhenUserIsNotSessionPatient_ReturnsForbid()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_Forbid_" + Guid.NewGuid())
      .Options;

    var actualPatientUserId = Guid.NewGuid();
    var otherUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = actualPatientUserId,
      UserName = "patient-owner@test.local",
      Email = "patient-owner@test.local",
      FirstName = "Owner",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var otherUser = new User
    {
      Id = otherUserId,
      UserName = "patient-other@test.local",
      Email = "patient-other@test.local",
      FirstName = "Other",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-owner@test.local",
      Email = "therapist-owner@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = actualPatientUserId,
      User = patientUser,
      FirstName = "Owner",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-FORBID-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, otherUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(4);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      TotalFee = 1000,
      PatientFee = 1000,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, otherUserId, role: "Patient");
    var result = await controller.ApproveReschedule(session.Id);

    Assert.IsType<ForbidResult>(result);
  }

  [Fact]
  public async Task ApproveReschedule_WhenStatusIsNotPending_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_WrongStatus_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-status@test.local",
      Email = "patient-status@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-status@test.local",
      Email = "therapist-status@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-STATUS-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      ProposedRescheduleStartAt = DateTime.UtcNow.AddDays(4),
      ProposedRescheduleEndAt = DateTime.UtcNow.AddDays(4).AddHours(1),
      TotalFee = 1000,
      PatientFee = 1000,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.ApproveReschedule(session.Id);

    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    Assert.Equal("Session is not pending reschedule approval", badRequest.Value);
  }

  [Fact]
  public async Task ApproveReschedule_WhenProposalFieldsMissing_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_NoProposal_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-noproposal@test.local",
      Email = "patient-noproposal@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-noproposal@test.local",
      Email = "therapist-noproposal@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-NOPROP-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      // Missing proposed fields
      ProposedRescheduleStartAt = null,
      ProposedRescheduleEndAt = null,
      TotalFee = 1000,
      PatientFee = 1000,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.ApproveReschedule(session.Id);

    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    Assert.Equal("No reschedule proposal found", badRequest.Value);
  }

  [Fact]
  public async Task ApproveReschedule_WhenRelieverTherapistMissing_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_RelieverMissing_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-relievermissing@test.local",
      Email = "patient-relievermissing@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-relievermissing@test.local",
      Email = "therapist-relievermissing@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-REL-MISS-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(4);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      IsRelieverProposed = true,
      RelieverTherapistId = 999999,
      RelieverSubstitutionReason = "Cover needed",
      TotalFee = 1000,
      PatientFee = 1000,
    };
    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.ApproveReschedule(session.Id);

    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);
    Assert.Equal("Reliever therapist not found", badRequest.Value);
  }

  [Fact]
  public async Task ApproveReschedule_WhenProposedTimeConflicts_ReturnsBadRequest()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_Conflict_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();
    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient-conflict@test.local",
      Email = "patient-conflict@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist-conflict@test.local",
      Email = "therapist-conflict@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-CONFLICT-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(6);
    var proposedEnd = proposedStart.AddHours(1);

    var pending = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(2),
      EndAt = DateTime.UtcNow.AddDays(2).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      TotalFee = 1000,
      PatientFee = 1000,
    };

    var conflicting = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = proposedStart.AddMinutes(15),
      EndAt = proposedEnd.AddMinutes(15),
      DurationMinutes = 60,
      Status = SessionStatus.Scheduled,
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.AddRange(pending, conflicting);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");
    var result = await controller.ApproveReschedule(pending.Id);

    var badRequest = Assert.IsType<BadRequestObjectResult>(result);
    Assert.Equal(StatusCodes.Status400BadRequest, badRequest.StatusCode);

    var message = badRequest.Value?.GetType().GetProperty("message")?.GetValue(badRequest.Value)?.ToString();
    Assert.Equal("The proposed time conflicts with another session.", message);
  }

  [Fact]
  public async Task ApproveReschedule_WhenPendingProposal_UpdatesScheduleAndClearsProposalFields()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient@test.local",
      Email = "patient@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var therapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist@test.local",
      Email = "therapist@test.local",
      FirstName = "Test",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var therapist = new PhysicalTherapist
    {
      UserId = therapistUser.Id,
      User = therapistUser,
      LicenseNumber = "PT-TEST-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, therapistUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.Add(therapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var originalStart = DateTime.UtcNow.AddDays(2);
    var originalEnd = originalStart.AddHours(1);
    var proposedStart = DateTime.UtcNow.AddDays(4);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = therapist,
      Contract = contract,
      StartAt = originalStart,
      EndAt = originalEnd,
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      RescheduleProposalReason = "Need to move schedule",
      RescheduleProposedAt = DateTime.UtcNow.AddMinutes(-5),
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");

    var result = await controller.ApproveReschedule(session.Id);
    var ok = Assert.IsType<OkObjectResult>(result);
    Assert.Equal(StatusCodes.Status200OK, ok.StatusCode ?? StatusCodes.Status200OK);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);
    Assert.Equal(SessionStatus.Scheduled, updated.Status);
    Assert.True(updated.IsRescheduled);
    Assert.NotNull(updated.RescheduledAt);
    Assert.Equal(proposedStart, updated.StartAt);
    Assert.Equal(proposedEnd, updated.EndAt);
    Assert.Equal(60, updated.DurationMinutes);

    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);

    // Therapist should remain unchanged when no reliever was proposed
    Assert.Equal(therapist.Id, updated.PhysicalTherapistId);
  }

  [Fact]
  public async Task ApproveReschedule_WhenRelieverProposed_SwapsTherapistAndClearsRelieverFields()
  {
    var options = new DbContextOptionsBuilder<agapayDbContext>()
      .UseInMemoryDatabase("TestDb_ApproveReschedule_Reliever_" + Guid.NewGuid())
      .Options;

    var patientUserId = Guid.NewGuid();

    await using var db = new agapayDbContext(options);

    var patientUser = new User
    {
      Id = patientUserId,
      UserName = "patient2@test.local",
      Email = "patient2@test.local",
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var originalTherapistUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "therapist2@test.local",
      Email = "therapist2@test.local",
      FirstName = "Orig",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1985, 5, 5),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var relieverUser = new User
    {
      Id = Guid.NewGuid(),
      UserName = "reliever@test.local",
      Email = "reliever@test.local",
      FirstName = "Reliever",
      LastName = "Therapist",
      DateOfBirth = new DateOnly(1988, 8, 8),
      CreatedAt = DateTime.UtcNow,
      UpdatedAt = DateTime.UtcNow,
      EmailConfirmed = true,
    };

    var patient = new Patient
    {
      UserId = patientUserId,
      User = patientUser,
      FirstName = "Test",
      LastName = "Patient",
      DateOfBirth = new DateOnly(1990, 1, 1),
      RelationshipToUser = "Self",
      IsActive = true,
    };

    var originalTherapist = new PhysicalTherapist
    {
      UserId = originalTherapistUser.Id,
      User = originalTherapistUser,
      LicenseNumber = "PT-ORIG-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    var relieverTherapist = new PhysicalTherapist
    {
      UserId = relieverUser.Id,
      User = relieverUser,
      LicenseNumber = "PT-REL-001",
      VerificationStatus = VerificationStatus.Verified,
      IsOnboardingComplete = true,
    };

    db.Users.AddRange(patientUser, originalTherapistUser, relieverUser);
    db.Patients.Add(patient);
    db.PhysicalTherapists.AddRange(originalTherapist, relieverTherapist);

    var contract = new Contract
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      StartDate = DateTime.UtcNow.Date,
      Status = ContractStatus.Active,
    };
    db.Contracts.Add(contract);

    var proposedStart = DateTime.UtcNow.AddDays(5);
    var proposedEnd = proposedStart.AddHours(1);

    var session = new TherapySession
    {
      Patient = patient,
      PhysicalTherapist = originalTherapist,
      Contract = contract,
      StartAt = DateTime.UtcNow.AddDays(3),
      EndAt = DateTime.UtcNow.AddDays(3).AddHours(1),
      DurationMinutes = 60,
      Status = SessionStatus.PendingRescheduleApproval,
      ProposedRescheduleStartAt = proposedStart,
      ProposedRescheduleEndAt = proposedEnd,
      IsRelieverProposed = true,
      RelieverTherapistId = relieverTherapist.Id,
      RelieverSubstitutionReason = "Cover needed",
      TotalFee = 1000,
      PatientFee = 1000,
    };

    db.TherapySessions.Add(session);
    await db.SaveChangesAsync();

    var controller = CreateController(db, patientUserId, role: "Patient");

    var result = await controller.ApproveReschedule(session.Id);
    Assert.IsType<OkObjectResult>(result);

    var updated = await db.TherapySessions.FirstAsync(s => s.Id == session.Id);

    Assert.Equal(SessionStatus.Scheduled, updated.Status);
    Assert.True(updated.IsRescheduled);
    Assert.NotNull(updated.RescheduledAt);

    Assert.Equal(proposedStart, updated.StartAt);
    Assert.Equal(proposedEnd, updated.EndAt);

    // Reliever should be applied
    Assert.Equal(relieverTherapist.Id, updated.PhysicalTherapistId);

    // Proposal + reliever proposal fields should be cleared
    Assert.Null(updated.ProposedRescheduleStartAt);
    Assert.Null(updated.ProposedRescheduleEndAt);
    Assert.Null(updated.RescheduleProposalReason);
    Assert.Null(updated.RescheduleProposedAt);

    Assert.False(updated.IsRelieverProposed);
    Assert.Null(updated.RelieverTherapistId);
    Assert.Null(updated.RelieverSubstitutionReason);
  }

  private static SessionsController CreateController(agapayDbContext db, Guid userId, string role)
  {
    var loggerFactory = LoggerFactory.Create(b => { });
    var logger = loggerFactory.CreateLogger<SessionsController>();

    var sessions = new SessionService(db, new NoopRealtimeNotifier(), loggerFactory.CreateLogger<SessionService>());

    var controller = new SessionsController(db, sessions, logger);
    controller.ControllerContext = new ControllerContext
    {
      HttpContext = new DefaultHttpContext
      {
        User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
          new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
          new Claim(ClaimTypes.Role, role)
        }, authenticationType: "TestAuth"))
      }
    };

    return controller;
  }

  private sealed class NoOpHubContext : IHubContext<SessionsHub>
  {
    public IHubClients Clients { get; } = new NoOpHubClients();
    public IGroupManager Groups { get; } = new NoOpGroupManager();
  }

  private sealed class NoOpHubClients : IHubClients
  {
    private static readonly IClientProxy Proxy = new NoOpClientProxy();

    public IClientProxy All => Proxy;
    public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Client(string connectionId) => Proxy;
    public IClientProxy Clients(IReadOnlyList<string> connectionIds) => Proxy;
    public IClientProxy Group(string groupName) => Proxy;
    public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => Proxy;
    public IClientProxy Groups(IReadOnlyList<string> groupNames) => Proxy;
    public IClientProxy User(string userId) => Proxy;
    public IClientProxy Users(IReadOnlyList<string> userIds) => Proxy;
  }

  private sealed class NoOpGroupManager : IGroupManager
  {
    public Task AddToGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
    public Task RemoveFromGroupAsync(string connectionId, string groupName, CancellationToken cancellationToken = default) => Task.CompletedTask;
  }

  private sealed class NoOpClientProxy : IClientProxy
  {
    public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default) => Task.CompletedTask;
  }
}
