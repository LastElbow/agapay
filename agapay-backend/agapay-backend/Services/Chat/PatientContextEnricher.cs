using System;
using System.Threading.Tasks;
using agapay_backend.Data;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Services.Chat
{
  /// <summary>
  /// Shared "patient context" enrichment used by both ChatController conversation
  /// history and ChatHub message broadcast: checks whether the given user has the
  /// Patient role and, if so, builds the patient context payload from their active
  /// patient profile. Enrichment failures are swallowed (returning null) so chat
  /// keeps working.
  /// </summary>
  public static class PatientContextEnricher
  {
    public static async Task<object?> BuildPatientContextAsync(agapayDbContext context, Guid userId)
    {
      try
      {
        var isPatient = await context.UserRoles
            .Join(context.Roles, ur => ur.RoleId, r => r.Id, (ur, r) => new { ur.UserId, r.Name })
            .AnyAsync(x => x.UserId == userId && x.Name == "Patient");

        if (isPatient)
        {
          var patient = await context.Patients
              .AsNoTracking()
              .FirstOrDefaultAsync(p => p.UserId == userId && p.IsActive);

          if (patient != null)
          {
            return new
            {
              id = patient.Id,
              firstName = patient.FirstName,
              lastName = patient.LastName,
              dateOfBirth = patient.DateOfBirth,
              relationshipToUser = patient.RelationshipToUser,
              address = patient.Address,
              barangay = patient.Barangay,
              latitude = patient.Latitude,
              longitude = patient.Longitude,
              occupation = patient.Occupation,
              activityLevel = patient.ActivityLevel,
              currentComplaints = patient.CurrentComplaints
            };
          }
        }
      }
      catch
      {
        // swallow enrichment errors to avoid breaking chat
      }

      return null;
    }
  }
}
