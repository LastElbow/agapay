using agapay_backend.Entities;
using System.Security.Claims;

namespace agapay_backend.Services
{
    public interface ITokenService
    {
        string CreateAccessToken(User user, IEnumerable<string> roles);
        string CreateRefreshToken();
        ClaimsPrincipal GetPrincipalFromExpiredToken(string token);
    }
}
