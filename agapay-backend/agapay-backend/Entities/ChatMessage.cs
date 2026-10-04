using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace agapay_backend.Entities
{
    public class ChatMessage
    {
        public int Id { get; set; }

        [ForeignKey("ConversationId")]
        public int ConversationId { get; set; }
        public Conversation Conversation { get; set; } = null!;

        // The user who sent the message
        [ForeignKey("SenderId")]
        public Guid SenderId { get; set; }
        public User Sender { get; set; } = null!;

        // The user who should receive the message
        [ForeignKey("ReceiverId")]
        public Guid ReceiverId { get; set; }
        public User Receiver { get; set; } = null!;

        public string Content { get; set; } = string.Empty;
        public string? ImagePath { get; set; }
        public string MessageType { get; set; } = "TEXT";
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
        public bool IsRead { get; set; } = false;
    }
}
