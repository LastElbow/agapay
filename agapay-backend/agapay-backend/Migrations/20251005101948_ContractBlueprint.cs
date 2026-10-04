using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class ContractBlueprint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ConditionCase",
                table: "TherapySessions",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DetailsConfirmedAt",
                table: "TherapySessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "DetailsProposedAt",
                table: "TherapySessions",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LocationFee",
                table: "TherapySessions",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MiscellaneousFee",
                table: "TherapySessions",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProfessionalFee",
                table: "TherapySessions",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BlueprintConfirmedAt",
                table: "Contracts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "BlueprintProposedAt",
                table: "Contracts",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CaseToTreat",
                table: "Contracts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "LocationFee",
                table: "Contracts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "MiscellaneousFee",
                table: "Contracts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ProfessionalFee",
                table: "Contracts",
                type: "numeric",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SessionDays",
                table: "Contracts",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "SessionEndTime",
                table: "Contracts",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<TimeOnly>(
                name: "SessionStartTime",
                table: "Contracts",
                type: "time without time zone",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TotalFee",
                table: "Contracts",
                type: "numeric",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConditionCase",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "DetailsConfirmedAt",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "DetailsProposedAt",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "LocationFee",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "MiscellaneousFee",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "ProfessionalFee",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "BlueprintConfirmedAt",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "BlueprintProposedAt",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "CaseToTreat",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "LocationFee",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "MiscellaneousFee",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "ProfessionalFee",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "SessionDays",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "SessionEndTime",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "SessionStartTime",
                table: "Contracts");

            migrationBuilder.DropColumn(
                name: "TotalFee",
                table: "Contracts");
        }
    }
}
