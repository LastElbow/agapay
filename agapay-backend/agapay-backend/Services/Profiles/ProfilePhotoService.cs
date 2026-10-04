using Microsoft.AspNetCore.Http;

namespace agapay_backend.Services.Profiles
{
    /// <summary>
    /// Extracted verbatim from the patient and therapist UploadProfilePicture
    /// endpoints in PatientController / TherapistController. Delete failures are
    /// swallowed (matching the original catch-all), and the fresh picture is
    /// uploaded to Supabase under the caller-provided folder before a signed
    /// 1-hour display URL is resolved.
    /// </summary>
    public class ProfilePhotoService : IProfilePhotoService
    {
        private readonly ISupabaseStorageService _storageService;

        public ProfilePhotoService(ISupabaseStorageService storageService)
        {
            _storageService = storageService;
        }

        public async Task<ProfilePhotoUploadResult> UploadAsync(IFormFile file, string folder, string? oldPicturePath, CancellationToken cancellationToken = default)
        {
            // Delete old profile picture if exists
            if (!string.IsNullOrEmpty(oldPicturePath))
            {
                try
                {
                    await _storageService.DeleteFileAsync(oldPicturePath, cancellationToken);
                }
                catch
                {
                    // Swallow deletion errors - not fatal
                }
            }

            // Upload new profile picture
            var uploadedPath = await _storageService.UploadFileAsync(file, folder, cancellationToken);

            // Get signed URL for immediate display
            var displayUrl = await _storageService.ResolveUrlAsync(uploadedPath, 3600, cancellationToken);

            return new ProfilePhotoUploadResult(uploadedPath, displayUrl);
        }
    }
}
