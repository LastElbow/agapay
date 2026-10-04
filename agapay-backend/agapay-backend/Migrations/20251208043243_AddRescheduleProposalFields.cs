using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddRescheduleProposalFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "YearsOfExperience",
                table: "PhysicalTherapists");

            migrationBuilder.AddColumn<DateTime>(
                name: "ProposedRescheduleEndAt",
                table: "TherapySessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "ProposedRescheduleStartAt",
                table: "TherapySessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RescheduleProposalReason",
                table: "TherapySessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RescheduleProposedAt",
                table: "TherapySessions",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProposedRescheduleEndAt",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "ProposedRescheduleStartAt",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "RescheduleProposalReason",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "RescheduleProposedAt",
                table: "TherapySessions");

            migrationBuilder.AddColumn<int>(
                name: "YearsOfExperience",
                table: "PhysicalTherapists",
                type: "integer",
                nullable: true);
        }
    }
}
