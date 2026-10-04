using System.Security.Claims;

namespace agapay_backend.Common
{
  public interface ICurrentUser
  {
    bool IsAuthenticated { get; }

    /// <summary>
    /// Parsed NameIdentifier claim. Returns null (never throws) when the claim is
    /// missing or malformed — prefer this over Guid.Parse on the raw claim.
    /// </summary>
    Guid? UserId { get; }

    string? UserIdRaw { get; }
    string? Email { get; }
    IReadOnlyCollection<string> Roles { get; }

    bool IsInRole(string role);
    bool HasAnyRole(params string[] roles);
  }

  public class CurrentUser : ICurrentUser
  {
    private readonly IHttpContextAccessor _accessor;

    public CurrentUser(IHttpContextAccessor accessor)
    {
      _accessor = accessor;
    }

    private ClaimsPrincipal? Principal => _accessor.HttpContext?.User;

    public bool IsAuthenticated => Principal?.Identity?.IsAuthenticated ?? false;

    public string? UserIdRaw => Principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

    public Guid? UserId => Guid.TryParse(UserIdRaw, out var id) ? id : null;

    public string? Email => Principal?.FindFirst(ClaimTypes.Email)?.Value;

    public IReadOnlyCollection<string> Roles =>
        Principal?.FindAll(ClaimTypes.Role).Select(c => c.Value).ToArray() ?? Array.Empty<string>();

    public bool IsInRole(string role) => Principal?.IsInRole(role) ?? false;

    public bool HasAnyRole(params string[] roles)
    {
      foreach (var role in roles)
      {
        if (IsInRole(role)) return true;
      }
      return false;
    }
  }
}
