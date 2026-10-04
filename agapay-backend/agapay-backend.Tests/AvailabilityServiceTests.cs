using agapay_backend.Data;
using agapay_backend.Entities;
using agapay_backend.Services;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using Xunit;

namespace agapay_backend.Tests
{
    public class AvailabilityServiceTests
    {
        private readonly DbContextOptions<agapayDbContext> _options;

        public AvailabilityServiceTests()
        {
            _options = new DbContextOptionsBuilder<agapayDbContext>()
                .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
                .Options;
        }

        private async Task<agapayDbContext> GetDatabaseContext()
        {
            var context = new agapayDbContext(_options);
            await context.Database.EnsureCreatedAsync();
            return context;
        }

        [Fact]
        public async Task UpdateTherapistAvailability_Throws_On_Overlap_Recurring()
        {
            // Arrange
            using var context = await GetDatabaseContext();
            var service = new AvailabilityService(context);
            var therapistId = 1;

            // Existing recurring block: Monday 6:00 - 7:00
            context.TherapistAvailabilities.Add(new TherapistAvailability
            {
                PhysicalTherapistId = therapistId,
                DayOfWeek = DayOfWeekEnum.Monday,
                StartTime = new TimeOnly(6, 0),
                EndTime = new TimeOnly(7, 0),
                IsAvailable = true
            });
            await context.SaveChangesAsync();

            // Act
            // Try to add overlapping block: Monday 6:30 - 7:30
            var newAvailability = new List<TherapistAvailabilityDto>
            {
                new TherapistAvailabilityDto
                {
                    DayOfWeek = DayOfWeekEnum.Monday,
                    StartTime = new TimeOnly(6, 30),
                    EndTime = new TimeOnly(7, 30),
                    IsAvailable = true
                }
            };

            // Assert
            await Assert.ThrowsAsync<InvalidOperationException>(() => 
                service.UpdateTherapistAvailability(therapistId, newAvailability));
        }

        [Fact]
        public async Task UpdateTherapistAvailability_Throws_On_Overlap_Recurring_Inside()
        {
             // Arrange
            using var context = await GetDatabaseContext();
            var service = new AvailabilityService(context);
            var therapistId = 1;

            // Existing recurring block: Monday 6:00 - 8:00
            context.TherapistAvailabilities.Add(new TherapistAvailability
            {
                PhysicalTherapistId = therapistId,
                DayOfWeek = DayOfWeekEnum.Monday,
                StartTime = new TimeOnly(6, 0),
                EndTime = new TimeOnly(8, 0),
                IsAvailable = true
            });
            await context.SaveChangesAsync();

            // Act
            // Try to add overlapping block inside: Monday 6:30 - 7:30
            var newAvailability = new List<TherapistAvailabilityDto>
            {
                new TherapistAvailabilityDto
                {
                    DayOfWeek = DayOfWeekEnum.Monday,
                    StartTime = new TimeOnly(6, 30),
                    EndTime = new TimeOnly(7, 30),
                    IsAvailable = true
                }
            };

            // Assert
            await Assert.ThrowsAsync<InvalidOperationException>(() => 
                service.UpdateTherapistAvailability(therapistId, newAvailability));
        }

         [Fact]
        public async Task UpdateTherapistAvailability_Throws_On_Overlap_Recurring_Enveloping()
        {
             // Arrange
            using var context = await GetDatabaseContext();
            var service = new AvailabilityService(context);
            var therapistId = 1;

            // Existing recurring block: Monday 6:30 - 7:00
            context.TherapistAvailabilities.Add(new TherapistAvailability
            {
                PhysicalTherapistId = therapistId,
                DayOfWeek = DayOfWeekEnum.Monday,
                StartTime = new TimeOnly(6, 30),
                EndTime = new TimeOnly(7, 0),
                IsAvailable = true
            });
            await context.SaveChangesAsync();

            // Act
            // Try to add overlapping block enveloping: Monday 6:00 - 7:30
            var newAvailability = new List<TherapistAvailabilityDto>
            {
                new TherapistAvailabilityDto
                {
                    DayOfWeek = DayOfWeekEnum.Monday,
                    StartTime = new TimeOnly(6, 0),
                    EndTime = new TimeOnly(7, 30),
                    IsAvailable = true
                }
            };

            // Assert
            await Assert.ThrowsAsync<InvalidOperationException>(() => 
                service.UpdateTherapistAvailability(therapistId, newAvailability));
        }

        [Fact]
        public async Task UpdateTherapistAvailability_Allows_NonOverlap_Recurring()
        {
            // Arrange
            using var context = await GetDatabaseContext();
            var service = new AvailabilityService(context);
            var therapistId = 1;

            context.TherapistAvailabilities.Add(new TherapistAvailability
            {
                PhysicalTherapistId = therapistId,
                DayOfWeek = DayOfWeekEnum.Monday,
                StartTime = new TimeOnly(6, 0),
                EndTime = new TimeOnly(7, 0),
                IsAvailable = true
            });
            await context.SaveChangesAsync();

            // Act
            // Add adjacent block: Monday 7:00 - 8:00 (Should be allowed)
            var newAvailability = new List<TherapistAvailabilityDto>
            {
                new TherapistAvailabilityDto
                {
                    DayOfWeek = DayOfWeekEnum.Monday,
                    StartTime = new TimeOnly(7, 0),
                    EndTime = new TimeOnly(8, 0),
                    IsAvailable = true
                }
            };

            await service.UpdateTherapistAvailability(therapistId, newAvailability);

            // Assert
            var all = await context.TherapistAvailabilities.Where(t => t.PhysicalTherapistId == therapistId).ToListAsync();
            Assert.Equal(2, all.Count);
        }
    }
}
