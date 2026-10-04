using System.Security.Claims;
using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Common
{
  /// <summary>
  /// Shared lookup of the PhysicalTherapist row belonging to the caller,
  /// previously duplicated across Therapist/Sessions/Contracts/Availability controllers.
  /// </summary>
  public static class CurrentTherapist
  {
    /// <summary>Resolves the PhysicalTherapist row for the caller. Returns null when
    /// unauthenticated, the claim is malformed (never throws), or no profile exists.</summary>
    public static async Task<PhysicalTherapist?> GetForCallerAsync(this ClaimsPrincipal user, agapayDbContext db)
    {
      var raw = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
      if (!Guid.TryParse(raw, out var userId)) return null;
      return await db.PhysicalTherapists.FirstOrDefaultAsync(t => t.UserId == userId);
    }
  }
}
