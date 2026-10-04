using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddPerformanceIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TherapySessions_PatientId",
                table: "TherapySessions");

            migrationBuilder.DropIndex(
                name: "IX_TherapySessions_PhysicalTherapistId",
                table: "TherapySessions");

            migrationBuilder.DropIndex(
                name: "IX_ChatMessages_SenderId",
                table: "ChatMessages");

            migrationBuilder.CreateIndex(
                name: "IX_TherapySessions_PatientId_Status",
                table: "TherapySessions",
                columns: new[] { "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_TherapySessions_TherapistId_Status",
                table: "TherapySessions",
                columns: new[] { "PhysicalTherapistId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_Sender_Receiver_Timestamp",
                table: "ChatMessages",
                columns: new[] { "SenderId", "ReceiverId", "Timestamp" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_TherapySessions_PatientId_Status",
                table: "TherapySessions");

            migrationBuilder.DropIndex(
                name: "IX_TherapySessions_TherapistId_Status",
                table: "TherapySessions");

            migrationBuilder.DropIndex(
                name: "IX_ChatMessages_Sender_Receiver_Timestamp",
                table: "ChatMessages");

            migrationBuilder.CreateIndex(
                name: "IX_TherapySessions_PatientId",
                table: "TherapySessions",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_TherapySessions_PhysicalTherapistId",
                table: "TherapySessions",
                column: "PhysicalTherapistId");

            migrationBuilder.CreateIndex(
                name: "IX_ChatMessages_SenderId",
                table: "ChatMessages",
                column: "SenderId");
        }
    }
}
