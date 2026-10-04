using System;

namespace agapay_backend.Entities
{
  public class Block
  {
    public int Id { get; set; }
    public Guid BlockerUserId { get; set; }
    public Guid BlockedUserId { get; set; }
    public string? Reason { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ExpiresAt { get; set; }
  }
}
