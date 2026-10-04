using System;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Entities;
using agapay_backend.Models;

namespace agapay_backend.Services
{
    public class ChatMessageMapper : IChatMessageMapper
    {
        private readonly ISupabaseStorageService _storageService;

        public ChatMessageMapper(ISupabaseStorageService storageService)
        {
            _storageService = storageService;
        }

        public async Task<ChatMessageViewModel> ToViewModelAsync(
            ChatMessage message,
            Guid currentUserId,
            object? patientContext = null,
            CancellationToken cancellationToken = default)
        {
            if (message == null) throw new ArgumentNullException(nameof(message));

            var messageType = string.IsNullOrWhiteSpace(message.MessageType)
                ? "TEXT"
                : message.MessageType;

            var viewModel = new ChatMessageViewModel
            {
                Id = message.Id,
                ConversationId = message.ConversationId,
                SenderId = message.SenderId,
                ReceiverId = message.ReceiverId,
                Content = message.Content,
                ImagePath = message.ImagePath,
                MessageType = messageType,
                Timestamp = message.Timestamp,
                IsRead = message.IsRead,
                IsMine = message.SenderId == currentUserId,
                PatientContext = patientContext
            };

            if (string.Equals(messageType, "IMAGE", StringComparison.OrdinalIgnoreCase) &&
                !string.IsNullOrWhiteSpace(message.ImagePath))
            {
                try
                {
                    viewModel.SignedUrl = await _storageService
                        .GetSignedUrlAsync(message.ImagePath, 3600, cancellationToken)
                        .ConfigureAwait(false);
                }
                catch
                {
                    // Swallow errors when generating signed URLs to avoid breaking chat flows.
                }
            }

            return viewModel;
        }
    }
}
