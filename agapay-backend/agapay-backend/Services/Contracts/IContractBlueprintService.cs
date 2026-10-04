using System.Security.Claims;
using agapay_backend.Models;

namespace agapay_backend.Services.Contracts
{
    /// <summary>
    /// Outcome of a contract blueprint service operation that used to return an
    /// IActionResult: the controller maps these back to the exact same result
    /// types/status codes.
    /// </summary>
    public record ContractActionResult(int StatusCode, object? Payload);

    /// <summary>
    /// Blueprint lifecycle business logic extracted from ContractsController.
    /// Every method receives the caller's ClaimsPrincipal explicitly so
    /// role-branching stays verbatim; real-time fan-out goes through
    /// IRealtimeNotifier so a hub failure can never fail an already-committed
    /// DB write.
    /// </summary>
    public interface IContractBlueprintService
    {
        // ContractsController endpoints
        Task<ContractActionResult> UpdateBlueprintAsync(ClaimsPrincipal user, int contractId, UpdateContractBlueprintDto dto);
        Task<ContractActionResult> SendBlueprintForConfirmationAsync(ClaimsPrincipal user, int contractId);
        Task<ContractActionResult> ConfirmBlueprintAsync(ClaimsPrincipal user, int contractId);
        Task<ContractActionResult> DeclineBlueprintAsync(ClaimsPrincipal user, int contractId);
        Task<ContractActionResult> EndContractAsync(ClaimsPrincipal user, int contractId, EndContractDto dto);
    }
}
