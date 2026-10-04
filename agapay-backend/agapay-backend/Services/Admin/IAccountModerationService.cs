using System;
using System.Threading.Tasks;
using agapay_backend.Models.Requests;

namespace agapay_backend.Services.Admin
{
    /// <summary>
    /// User account moderation logic extracted verbatim from AdminController.
    /// Every method returns an AdminActionResult so the controller can map it
    /// back to the original IActionResult types with byte-identical status codes
    /// and payloads.
    /// </summary>
    public interface IAccountModerationService
    {
        // GET api/Admin/users/{userId}
        Task<AdminActionResult> GetUserDetailsAsync(Guid userId);

        // POST api/Admin/users/{userId}/warn
        Task<AdminActionResult> WarnUserAsync(Guid userId, WarnUserRequest request);

        // POST api/Admin/users/{userId}/suspend
        Task<AdminActionResult> SuspendUserAsync(Guid userId, SuspendUserRequest request);

        // POST api/Admin/users/{userId}/ban
        Task<AdminActionResult> BanUserAsync(Guid userId, BanUserRequest request);

        // POST api/Admin/users/{userId}/restore
        Task<AdminActionResult> RestoreUserAsync(Guid userId);

        // PUT api/Admin/users/{userId}/modify-suspension
        Task<AdminActionResult> ModifySuspensionAsync(Guid userId, ModifySuspensionRequest request);
    }
}
