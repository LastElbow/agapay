using agapay_backend.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Threading.Tasks;

namespace agapay_backend.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class LocationController : ControllerBase
    {
        private readonly agapayDbContext _context;

        public LocationController(agapayDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// Gets the destination coordinates for a given therapy session.
        /// </summary>
        [HttpGet("session/{sessionId}")]
        public async Task<IActionResult> GetSessionDestination(int sessionId)
        {
            var session = await _context.TherapySessions
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.Id == sessionId);

            if (session == null)
            {
                return NotFound("Session not found.");
            }

            // Basic authorization: ensure the user is part of the session
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var therapist = await _context.PhysicalTherapists.FirstOrDefaultAsync(t => t.UserId.ToString() == userId);
            var patient = await _context.Patients.FirstOrDefaultAsync(p => p.UserId.ToString() == userId);

            if ((therapist != null && session.PhysicalTherapistId != therapist.Id) &&
                (patient != null && session.PatientId != patient.Id))
            {
                return Forbid();
            }

            if (!session.Latitude.HasValue || !session.Longitude.HasValue)
            {
                return BadRequest("Session location is not set.");
            }

            return Ok(new { session.Latitude, session.Longitude });
        }
    }
}