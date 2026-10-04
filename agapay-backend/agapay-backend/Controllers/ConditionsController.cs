using agapay_backend.Data;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Controllers
{
  [ApiController]
  [Route("api/[controller]")]
  public class ConditionsController : ControllerBase
  {
    private readonly agapayDbContext _context;

    public ConditionsController(agapayDbContext context)
    {
      _context = context;
    }

    /// <summary>
    /// Search for verified other conditions (autocomplete endpoint)
    /// </summary>
    /// <param name="q">Search term</param>
    /// <returns>Array of verified condition names</returns>
    [HttpGet("search")]
    [AllowAnonymous]
    public async Task<ActionResult<List<string>>> SearchConditions([FromQuery] string? q)
    {
      if (string.IsNullOrWhiteSpace(q))
      {
        return Ok(new List<string>());
      }

      var searchTerm = q.Trim();

      var conditions = await _context.OtherConditions
          .Where(c => c.Status == CurationStatus.Verified &&
                     EF.Functions.Like(c.Name, $"%{searchTerm}%"))
          .OrderBy(c => c.Name)
          .Take(10)
          .Select(c => c.Name)
          .ToListAsync();

      return Ok(conditions);
    }
  }
}
