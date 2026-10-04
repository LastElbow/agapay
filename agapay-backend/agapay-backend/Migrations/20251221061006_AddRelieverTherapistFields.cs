using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddRelieverTherapistFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsRelieverProposed",
                table: "TherapySessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "RelieverSubstitutionReason",
                table: "TherapySessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RelieverTherapistId",
                table: "TherapySessions",
                type: "integer",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsRelieverProposed",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "RelieverSubstitutionReason",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "RelieverTherapistId",
                table: "TherapySessions");
        }
    }
}
