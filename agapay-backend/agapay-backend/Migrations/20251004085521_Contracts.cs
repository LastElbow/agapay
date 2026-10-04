using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class Contracts : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ContractId",
                table: "TherapySessions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "Contracts",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PatientId = table.Column<int>(type: "integer", nullable: false),
                    PhysicalTherapistId = table.Column<int>(type: "integer", nullable: false),
                    StartDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contracts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Contracts_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_Contracts_PhysicalTherapists_PhysicalTherapistId",
                        column: x => x.PhysicalTherapistId,
                        principalTable: "PhysicalTherapists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TherapySessions_ContractId",
                table: "TherapySessions",
                column: "ContractId");

            migrationBuilder.CreateIndex(
                name: "IX_Contracts_PatientId",
                table: "Contracts",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Contracts_PhysicalTherapistId",
                table: "Contracts",
                column: "PhysicalTherapistId");

            migrationBuilder.AddForeignKey(
                name: "FK_TherapySessions_Contracts_ContractId",
                table: "TherapySessions",
                column: "ContractId",
                principalTable: "Contracts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_TherapySessions_Contracts_ContractId",
                table: "TherapySessions");

            migrationBuilder.DropTable(
                name: "Contracts");

            migrationBuilder.DropIndex(
                name: "IX_TherapySessions_ContractId",
                table: "TherapySessions");

            migrationBuilder.DropColumn(
                name: "ContractId",
                table: "TherapySessions");
        }
    }
}
