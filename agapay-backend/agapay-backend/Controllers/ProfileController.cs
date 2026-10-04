using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace agapay_backend.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ProfileController : ControllerBase
    {
        [HttpGet("me")]
        [Authorize]
        public IActionResult GetMyProfile()
        {
            return Ok(new { message = "Welcome, authenticated User" });
        }

        [HttpGet("admin-test")]
        [Authorize(Roles = "Admin")]
        public IActionResult GetMyAdminProfile()
        {
            return Ok(new { message = "Welcome, Admin" });
        }
    }
}
