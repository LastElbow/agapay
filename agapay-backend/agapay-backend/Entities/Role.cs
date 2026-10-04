using Microsoft.AspNetCore.Identity;

namespace agapay_backend.Entities
{
    public class Role : IdentityRole<Guid>
    {
        public ICollection<User> Users { get; } = new List<User>();
    }
}
