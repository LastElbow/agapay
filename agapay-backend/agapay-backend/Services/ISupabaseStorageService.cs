using Microsoft.AspNetCore.Http;
using System.Threading;
using System.Threading.Tasks;

namespace agapay_backend.Services
{
    public interface ISupabaseStorageService
    {
        /// <summary>
        /// Uploads the provided IFormFile to Supabase storage under the specified folder and returns the object path (logical key).
        /// Example returned value: "licenses/{userId}/{guid}.jpg"
        /// </summary>
        Task<string> UploadFileAsync(IFormFile file, string folder, CancellationToken cancellationToken = default);

        /// <summary>
        /// Deletes an object from the configured Supabase bucket. Accepts either the public URL returned earlier
        /// or the object path. Implementation will extract object path and call Supabase delete API.
        /// </summary>
        Task DeleteFileAsync(string publicUrlOrPath, CancellationToken cancellationToken = default);

        /// <summary>
        /// Build public URL from object path (for preview). If you later switch to private buckets you can change this to return signed URLs.
        /// </summary>
        string GetPublicUrl(string objectPath);

        /// <summary>
        /// Generate a short-lived signed URL for a private object path.
        /// Returns a URL that grants temporary read access (expiresInSeconds).
        /// Requires Supabase service role key.
        /// </summary>
        Task<string?> GetSignedUrlAsync(string objectPath, int expiresInSeconds = 259200, CancellationToken cancellationToken = default);

        /// <summary>
        /// Resolves a usable display URL for an object path: tries a short-lived signed URL
        /// first and falls back to the public URL when signing fails or returns null.
        /// Callers should null/whitespace-check the path before invoking.
        /// </summary>
        Task<string> ResolveUrlAsync(string objectPath, int expiresInSeconds = 3600, CancellationToken cancellationToken = default);
    }
}
