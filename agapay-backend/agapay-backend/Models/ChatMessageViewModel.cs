using System;

namespace agapay_backend.Models
{
    public class ChatMessageViewModel
    {
        public int Id { get; set; }
        public int ConversationId { get; set; }
        public Guid SenderId { get; set; }
        public Guid ReceiverId { get; set; }
        public string? Content { get; set; }
        public string? ImagePath { get; set; }
        public string MessageType { get; set; } = "TEXT";
        public DateTime Timestamp { get; set; }
        public bool IsRead { get; set; }
        public bool IsMine { get; set; }
        public string? SignedUrl { get; set; }
        public object? PatientContext { get; set; }
    }
}
