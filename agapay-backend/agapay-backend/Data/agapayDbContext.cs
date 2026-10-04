using System;
using agapay_backend.Entities;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;


namespace agapay_backend.Data
{
  public class agapayDbContext(DbContextOptions<agapayDbContext> options) : IdentityDbContext<User, Role, Guid>(options)
  {
    public DbSet<Patient> Patients { get; set; }
    public DbSet<PhysicalTherapist> PhysicalTherapists { get; set; }
    public DbSet<Specialization> Specializations { get; set; }
    public DbSet<ConditionTreated> ConditionsTreated { get; set; }
    public DbSet<ServiceArea> ServiceAreas { get; set; }
    public DbSet<TherapistAvailability> TherapistAvailabilities { get; set; }
    public DbSet<PatientPreferences> PatientPreferences { get; set; }
    public DbSet<PatientPreferredDay> PatientPreferredDays { get; set; }
    public DbSet<PatientAvailability> PatientAvailabilities { get; set; }
    public DbSet<OtherCondition> OtherConditions { get; set; }

    // New sets
    public DbSet<TherapySession> TherapySessions { get; set; }
    public DbSet<SessionLog> SessionLogs { get; set; }
    public DbSet<TherapistRating> TherapistRatings { get; set; }
    public DbSet<PatientRating> PatientRatings { get; set; }
    public DbSet<Conversation> Conversations { get; set; }
    public DbSet<ChatMessage> ChatMessages { get; set; }
    public DbSet<Block> Blocks { get; set; }
    public DbSet<Report> Reports { get; set; }
    public DbSet<Contract> Contracts { get; set; }
    public DbSet<OtpCode> OtpCodes { get; set; }
    public DbSet<SignupOtpCode> SignupOtpCodes { get; set; }
    public DbSet<TrustedDevice> TrustedDevices { get; set; }
    public DbSet<TherapistColleague> TherapistColleagues { get; set; }
    public DbSet<Notification> Notifications { get; set; }


    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
      base.OnModelCreating(modelBuilder);

      modelBuilder.Entity<User>()
          .HasMany(u => u.Patients)
          .WithOne(p => p.User)
          .HasForeignKey(p => p.UserId);

      modelBuilder.Entity<PhysicalTherapist>()
          .HasMany(pt => pt.Specializations)
          .WithMany(s => s.PhysicalTherapists)
          .UsingEntity(j => j.ToTable("PhysicalTherapistSpecializations"));

      modelBuilder.Entity<PhysicalTherapist>()
          .HasMany(pt => pt.ConditionsTreated)
          .WithMany(ct => ct.PhysicalTherapists)
          .UsingEntity(j => j.ToTable("PhysicalTherapistConditions"));

      modelBuilder.Entity<PhysicalTherapist>()
          .HasMany(pt => pt.ServiceAreas)
          .WithMany(sa => sa.PhysicalTherapists)
          .UsingEntity(j => j.ToTable("PhysicalTherapistServiceAreas"));

      modelBuilder.Entity<PhysicalTherapist>()
          .HasMany(pt => pt.OtherConditions)
          .WithMany(oc => oc.PhysicalTherapists)
          .UsingEntity(j => j.ToTable("TherapistOtherConditions"));

      // OtherCondition unique constraint on Name
      modelBuilder.Entity<OtherCondition>()
          .HasIndex(oc => oc.Name)
          .IsUnique();

      // Availability relationships
      modelBuilder.Entity<TherapistAvailability>()
          .HasOne(ta => ta.PhysicalTherapist)
          .WithMany(pt => pt.Availabilities)
          .HasForeignKey(ta => ta.PhysicalTherapistId);

      modelBuilder.Entity<PatientPreferences>()
          .HasOne(pp => pp.Patient)
          .WithOne(p => p.Preferences)
          .HasForeignKey<PatientPreferences>(pp => pp.PatientId);

      // PatientPreferredDay relationship
      modelBuilder.Entity<PatientPreferredDay>()
          .HasOne(ppd => ppd.PatientPreferences)
          .WithMany(pp => pp.PreferredDays)
          .HasForeignKey(ppd => ppd.PatientPreferencesId)
          .OnDelete(DeleteBehavior.Cascade);

      // PatientAvailability relationship
      modelBuilder.Entity<PatientAvailability>()
          .HasOne(pa => pa.Patient)
          .WithMany(p => p.Availabilities)
          .HasForeignKey(pa => pa.PatientId)
          .OnDelete(DeleteBehavior.Cascade);

      // Contracts
      modelBuilder.Entity<Contract>()
          .HasOne(c => c.Patient)
          .WithMany()
          .HasForeignKey(c => c.PatientId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<Contract>()
          .HasOne(c => c.PhysicalTherapist)
          .WithMany()
          .HasForeignKey(c => c.PhysicalTherapistId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<Contract>()
          .HasMany(c => c.Sessions)
          .WithOne(s => s.Contract)
          .HasForeignKey(s => s.ContractId)
          .OnDelete(DeleteBehavior.Cascade);

      // Sessions
      modelBuilder.Entity<TherapySession>()
          .HasOne(s => s.PhysicalTherapist)
          .WithMany()
          .HasForeignKey(s => s.PhysicalTherapistId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<TherapySession>()
          .HasOne(s => s.Patient)
          .WithMany()
          .HasForeignKey(s => s.PatientId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<TherapySession>()
          .HasMany(s => s.SessionLogs)
          .WithOne(sl => sl.TherapySession)
          .HasForeignKey(sl => sl.TherapySessionId)
          .OnDelete(DeleteBehavior.Cascade);

      // Ratings
      modelBuilder.Entity<TherapistRating>()
          .HasOne(r => r.PhysicalTherapist)
          .WithMany()
          .HasForeignKey(r => r.PhysicalTherapistId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<TherapistRating>()
          .HasOne(r => r.Patient)
          .WithMany()
          .HasForeignKey(r => r.PatientId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<TherapistRating>()
          .HasOne(r => r.Contract)
          .WithMany()
          .HasForeignKey(r => r.ContractId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<PatientRating>()
          .HasOne(r => r.Patient)
          .WithMany()
          .HasForeignKey(r => r.PatientId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<PatientRating>()
          .HasOne(r => r.PhysicalTherapist)
          .WithMany()
          .HasForeignKey(r => r.PhysicalTherapistId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<PatientRating>()
          .HasOne(r => r.Contract)
          .WithMany()
          .HasForeignKey(r => r.ContractId)
          .OnDelete(DeleteBehavior.Cascade);

      // Conversations
      modelBuilder.Entity<Conversation>()
          .HasOne(c => c.ParticipantA)
          .WithMany()
          .HasForeignKey(c => c.ParticipantAId)
          .OnDelete(DeleteBehavior.Restrict);

      modelBuilder.Entity<Conversation>()
          .HasOne(c => c.ParticipantB)
          .WithMany()
          .HasForeignKey(c => c.ParticipantBId)
          .OnDelete(DeleteBehavior.Restrict);

      modelBuilder.Entity<Conversation>()
          .HasMany(c => c.Messages)
          .WithOne(m => m.Conversation)
          .HasForeignKey(m => m.ConversationId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<Conversation>()
          .HasIndex(c => new { c.ParticipantAId, c.ParticipantBId })
          .IsUnique();

      modelBuilder.Entity<Conversation>()
          .Property(c => c.Status)
          .HasMaxLength(16)
          .HasDefaultValue("Active");

      // Chat
      modelBuilder.Entity<ChatMessage>()
          .HasOne(m => m.Sender)
          .WithMany()
          .HasForeignKey(m => m.SenderId)
          .OnDelete(DeleteBehavior.Restrict);

      modelBuilder.Entity<ChatMessage>()
          .HasOne(m => m.Receiver)
          .WithMany()
          .HasForeignKey(m => m.ReceiverId)
          .OnDelete(DeleteBehavior.Restrict);

      modelBuilder.Entity<ChatMessage>()
          .Property(m => m.MessageType)
          .HasMaxLength(16)
          .HasDefaultValue("TEXT");

      modelBuilder.Entity<ChatMessage>()
          .Property(m => m.ImagePath)
          .HasMaxLength(512);

      modelBuilder.Entity<ChatMessage>()
          .Property(m => m.Content)
          .HasDefaultValue(string.Empty);

      // Ensure one Patient profile per user
      modelBuilder.Entity<Patient>()
          .HasIndex(p => p.UserId)
          .IsUnique();

      // Ensure one PhysicalTherapist profile per user
      modelBuilder.Entity<PhysicalTherapist>()
          .HasIndex(t => t.UserId)
          .IsUnique();

      // Limit PreferredRole length
      modelBuilder.Entity<User>()
          .Property(u => u.PreferredRole)
          .HasMaxLength(64);

      modelBuilder.Entity<Block>()
          .HasIndex(b => new { b.BlockerUserId, b.BlockedUserId })
          .IsUnique();

      modelBuilder.Entity<Block>()
          .Property(b => b.Reason)
          .HasMaxLength(512);

      modelBuilder.Entity<Report>()
          .Property(r => r.Category)
          .HasMaxLength(64);

      modelBuilder.Entity<Report>()
          .Property(r => r.Status)
          .HasMaxLength(32)
          .HasDefaultValue("New");

      modelBuilder.Entity<Report>()
          .Property(r => r.Notes)
          .HasMaxLength(2000);

      modelBuilder.Entity<Report>()
          .HasIndex(r => r.ReportedUserId);

      modelBuilder.Entity<Report>()
          .HasIndex(r => r.Status);

      modelBuilder.Entity<OtpCode>()
          .HasOne(o => o.User)
          .WithMany()
          .HasForeignKey(o => o.UserId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<OtpCode>()
          .HasIndex(o => new { o.UserId, o.Purpose, o.ExpirationTime })
          .HasDatabaseName("IX_OtpCodes_UserPurpose");

      modelBuilder.Entity<OtpCode>()
          .Property(o => o.Metadata)
          .HasMaxLength(256);

      modelBuilder.Entity<SignupOtpCode>()
          .HasIndex(o => new { o.NormalizedEmail, o.Purpose, o.ExpirationTime })
          .HasDatabaseName("IX_SignupOtpCodes_EmailPurpose");

      modelBuilder.Entity<SignupOtpCode>()
          .Property(o => o.NormalizedEmail)
          .HasMaxLength(256);

      modelBuilder.Entity<SignupOtpCode>()
          .Property(o => o.CodeHash)
          .HasMaxLength(128);

      modelBuilder.Entity<SignupOtpCode>()
          .Property(o => o.Metadata)
          .HasMaxLength(256);

      modelBuilder.Entity<TrustedDevice>()
          .HasIndex(td => new { td.UserId, td.DeviceId })
          .IsUnique();

      modelBuilder.Entity<TrustedDevice>()
          .Property(td => td.DeviceId)
          .HasMaxLength(128);

      modelBuilder.Entity<TrustedDevice>()
          .Property(td => td.DeviceName)
          .HasMaxLength(256);

      // TherapistColleague - trusted colleague network configuration
      modelBuilder.Entity<TherapistColleague>()
          .HasKey(tc => new { tc.TherapistId, tc.ColleagueId });

      modelBuilder.Entity<TherapistColleague>()
          .HasOne(tc => tc.Therapist)
          .WithMany(t => t.TrustedColleagues)
          .HasForeignKey(tc => tc.TherapistId)
          .OnDelete(DeleteBehavior.Cascade);

      modelBuilder.Entity<TherapistColleague>()
          .HasOne(tc => tc.Colleague)
          .WithMany()
          .HasForeignKey(tc => tc.ColleagueId)
          .OnDelete(DeleteBehavior.Restrict); // Prevent cascading deletes from colleague side

      modelBuilder.Entity<TherapistColleague>()
          .Property(tc => tc.Notes)
          .HasMaxLength(500);

      // Ensure therapist cannot add themselves as a colleague
      modelBuilder.Entity<TherapistColleague>()
          .ToTable(t => t.HasCheckConstraint("CK_TherapistColleague_NotSelf", "\"TherapistId\" <> \"ColleagueId\""));

      // Performance indexes for hot query paths
      modelBuilder.Entity<TherapySession>()
          .HasIndex(s => new { s.PhysicalTherapistId, s.Status })
          .HasDatabaseName("IX_TherapySessions_TherapistId_Status");

      modelBuilder.Entity<TherapySession>()
          .HasIndex(s => new { s.PatientId, s.Status })
          .HasDatabaseName("IX_TherapySessions_PatientId_Status");

      modelBuilder.Entity<TherapySession>()
          .HasIndex(s => s.ContractId)
          .HasDatabaseName("IX_TherapySessions_ContractId");

      modelBuilder.Entity<ChatMessage>()
          .HasIndex(m => new { m.SenderId, m.ReceiverId, m.Timestamp })
          .HasDatabaseName("IX_ChatMessages_Sender_Receiver_Timestamp");
    }
  }
}


