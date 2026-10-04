using System;
using System.Threading;
using System.Threading.Tasks;
using agapay_backend.Entities;
using agapay_backend.Models;

namespace agapay_backend.Services
{
    public interface IChatMessageMapper
    {
        Task<ChatMessageViewModel> ToViewModelAsync(
            ChatMessage message,
            Guid currentUserId,
            object? patientContext = null,
            CancellationToken cancellationToken = default);
    }
}
