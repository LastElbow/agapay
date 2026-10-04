using agapay_backend.Entities;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace agapay_backend.Data
{
  public static partial class SeedData
  {
    public static async Task Initialize(IServiceProvider serviceProvider)
    {
      var env = serviceProvider.GetRequiredService<IHostEnvironment>();
      var config = serviceProvider.GetRequiredService<IConfiguration>();
      var roleManager = serviceProvider.GetRequiredService<RoleManager<Role>>();
      var userManager = serviceProvider.GetRequiredService<UserManager<User>>();
      var context = serviceProvider.GetRequiredService<agapayDbContext>();
      var logger = serviceProvider.GetRequiredService<ILoggerFactory>().CreateLogger("SeedData");

      // Seed Roles
      string[] roleNames = { "Admin", "User", "Patient", "PhysicalTherapist" };
      foreach (var roleName in roleNames)
      {
        if (!await roleManager.RoleExistsAsync(roleName))
        {
          await roleManager.CreateAsync(new Role { Name = roleName });
        }
      }

      // Seed Admin User (development by default; can be enabled in other envs with Seed:AdminUser=true)
      var seedAdmin = env.IsDevelopment() || config.GetValue<bool>("Seed:AdminUser");
      if (seedAdmin)
      {
        if (await userManager.FindByEmailAsync("admin@demo.agapay.com") == null)
        {
          var adminUser = new User
          {
            UserName = "admin@demo.agapay.com",
            Email = "admin@demo.agapay.com",
            FirstName = "Admin",
            LastName = "User",
            EmailConfirmed = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
          };

          var result = await userManager.CreateAsync(adminUser, "Password123!");
          if (result.Succeeded)
          {
            await userManager.AddToRoleAsync(adminUser, "Admin");
          }
        }
      }

      //Seed here
      await SeedSpecializations(context);
      await SeedConditionsTreated(context);
      await SeedServiceAreas(context);
      await SeedRecommendationDemoData(context, userManager, logger);

      // Seed defense-day sessions around 11AM-12PM PHT using existing demo accounts
      await SeedDefenseDemoSessions(context, logger);
    }
  }
}
