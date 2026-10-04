using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Controllers
{
  [ApiController]
  [Route("api/admin/conditions")]
  [Authorize(Roles = "Admin")]
  public class AdminConditionsController : ControllerBase
  {
    private readonly agapayDbContext _context;

    public AdminConditionsController(agapayDbContext context)
    {
      _context = context;
    }

    /// <summary>
    /// Get all conditions with optional status filter
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<OtherConditionDto>>> GetConditions([FromQuery] string? status = null)
    {
      var query = _context.OtherConditions
          .Include(oc => oc.PhysicalTherapists)
          .AsQueryable();

      if (!string.IsNullOrEmpty(status))
      {
        if (Enum.TryParse<CurationStatus>(status, ignoreCase: true, out var statusEnum))
        {
          query = query.Where(oc => oc.Status == statusEnum);
        }
      }

      var conditions = await query
          .OrderBy(oc => oc.Status)
          .ThenByDescending(oc => oc.CreatedAt)
          .Select(oc => new OtherConditionDto
          {
            Id = oc.Id,
            Name = oc.Name,
            Status = oc.Status.ToString(),
            CreatedAt = oc.CreatedAt,
            UpdatedAt = oc.UpdatedAt,
            TherapistCount = oc.PhysicalTherapists.Count
          })
          .ToListAsync();

      return Ok(conditions);
    }

    /// <summary>
    /// Update a condition (approve, rename, etc.)
    /// </summary>
    [HttpPut("{id}")]
    public async Task<IActionResult> UpdateCondition(int id, [FromBody] UpdateOtherConditionDto dto)
    {
      var condition = await _context.OtherConditions.FindAsync(id);

      if (condition == null)
      {
        return NotFound(new { message = "Condition not found" });
      }

      // Update name if provided
      if (!string.IsNullOrWhiteSpace(dto.Name))
      {
        var trimmedName = dto.Name.Trim();

        // Check for duplicate names (case-insensitive, excluding current condition)
        var duplicate = await _context.OtherConditions
            .FirstOrDefaultAsync(oc => oc.Id != id && oc.Name.ToLower() == trimmedName.ToLower());

        if (duplicate != null)
        {
          return BadRequest(new { message = "A condition with this name already exists" });
        }

        condition.Name = trimmedName;
      }

      // Update status if provided
      if (!string.IsNullOrWhiteSpace(dto.Status))
      {
        if (Enum.TryParse<CurationStatus>(dto.Status, ignoreCase: true, out var statusEnum))
        {
          condition.Status = statusEnum;
        }
        else
        {
          return BadRequest(new { message = "Invalid status value" });
        }
      }

      condition.UpdatedAt = DateTime.UtcNow;

      _context.OtherConditions.Update(condition);
      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = "Condition updated successfully",
        condition = new OtherConditionDto
        {
          Id = condition.Id,
          Name = condition.Name,
          Status = condition.Status.ToString(),
          CreatedAt = condition.CreatedAt,
          UpdatedAt = condition.UpdatedAt,
          TherapistCount = await _context.Entry(condition).Collection(c => c.PhysicalTherapists).Query().CountAsync()
        }
      });
    }

    /// <summary>
    /// Delete a condition (reject pending condition)
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteCondition(int id)
    {
      var condition = await _context.OtherConditions
          .Include(oc => oc.PhysicalTherapists)
          .FirstOrDefaultAsync(oc => oc.Id == id);

      if (condition == null)
      {
        return NotFound(new { message = "Condition not found" });
      }

      // Only allow deletion if no therapists are associated
      if (condition.PhysicalTherapists.Any())
      {
        return BadRequest(new { message = $"Cannot delete condition: {condition.PhysicalTherapists.Count} therapist(s) are using it. Consider merging instead." });
      }

      _context.OtherConditions.Remove(condition);
      await _context.SaveChangesAsync();

      return Ok(new { message = "Condition deleted successfully" });
    }

    /// <summary>
    /// Merge a condition into another (for duplicates)
    /// </summary>
    [HttpPost("merge")]
    public async Task<IActionResult> MergeConditions([FromBody] MergeOtherConditionsDto dto)
    {
      var sourceCondition = await _context.OtherConditions
          .Include(oc => oc.PhysicalTherapists)
          .FirstOrDefaultAsync(oc => oc.Id == dto.SourceConditionId);

      var destinationCondition = await _context.OtherConditions
          .Include(oc => oc.PhysicalTherapists)
          .FirstOrDefaultAsync(oc => oc.Id == dto.DestinationConditionId);

      if (sourceCondition == null || destinationCondition == null)
      {
        return NotFound(new { message = "One or both conditions not found" });
      }

      if (sourceCondition.Id == destinationCondition.Id)
      {
        return BadRequest(new { message = "Cannot merge a condition with itself" });
      }

      // Re-associate all therapists from source to destination
      var therapistsToMove = sourceCondition.PhysicalTherapists.ToList();

      foreach (var therapist in therapistsToMove)
      {
        // Check if therapist already has the destination condition
        if (!destinationCondition.PhysicalTherapists.Contains(therapist))
        {
          destinationCondition.PhysicalTherapists.Add(therapist);
        }

        // Remove from source
        sourceCondition.PhysicalTherapists.Remove(therapist);
      }

      destinationCondition.UpdatedAt = DateTime.UtcNow;

      // Delete the source condition
      _context.OtherConditions.Remove(sourceCondition);

      await _context.SaveChangesAsync();

      return Ok(new
      {
        message = $"Successfully merged '{sourceCondition.Name}' into '{destinationCondition.Name}'",
        therapistsMoved = therapistsToMove.Count
      });
    }
  }
}
