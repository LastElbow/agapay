using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
    public class Conversation
    {
        public int Id { get; set; }

        [ForeignKey("ParticipantAId")]
        public Guid ParticipantAId { get; set; }
        public User ParticipantA { get; set; } = null!;

        [ForeignKey("ParticipantBId")]
        public Guid ParticipantBId { get; set; }
        public User ParticipantB { get; set; } = null!;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
        public string Status { get; set; } = "Active";
        public DateTime? ClosedAt { get; set; }
        public Guid? ClosedByUserId { get; set; }

        /// <summary>
        /// When ParticipantA cleared their chat history. Messages before this timestamp are hidden for ParticipantA.
        /// </summary>
        public DateTime? ClearedAtByParticipantA { get; set; }

        /// <summary>
        /// When ParticipantB cleared their chat history. Messages before this timestamp are hidden for ParticipantB.
        /// </summary>
        public DateTime? ClearedAtByParticipantB { get; set; }

        public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
    }
}
