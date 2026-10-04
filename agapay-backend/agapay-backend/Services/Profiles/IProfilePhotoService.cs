using Microsoft.AspNetCore.Http;

namespace agapay_backend.Services.Profiles
{
    /// <summary>
    /// Result of the shared profile-photo upload sequence: the stored object path
    /// (persisted by the caller on the User/Therapist row) and the signed display
    /// URL (returned to the client for immediate display).
    /// </summary>
    public record ProfilePhotoUploadResult(string UploadedPath, string DisplayUrl);

    /// <summary>
    /// Shared upload sequence extracted verbatim from the patient and therapist
    /// profile-picture endpoints: delete the previous picture (errors swallowed —
    /// not fatal), upload the new file, then resolve a signed URL for display.
    /// MIME validation, claim handling, DB updates and response payloads stay in
    /// each controller because they differ per endpoint.
    /// </summary>
    public interface IProfilePhotoService
    {
        Task<ProfilePhotoUploadResult> UploadAsync(IFormFile file, string folder, string? oldPicturePath, CancellationToken cancellationToken = default);
    }
}
