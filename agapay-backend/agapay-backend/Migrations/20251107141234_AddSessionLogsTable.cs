using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddSessionLogsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Use IF EXISTS to avoid failures on environments where the column was never created
            migrationBuilder.Sql("ALTER TABLE \"PatientPreferences\" DROP COLUMN IF EXISTS \"PreferredDayOfWeek\";");

            migrationBuilder.CreateTable(
                name: "OtherConditions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OtherConditions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SessionLogs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    TherapySessionId = table.Column<int>(type: "integer", nullable: false),
                    StartTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SessionLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SessionLogs_TherapySessions_TherapySessionId",
                        column: x => x.TherapySessionId,
                        principalTable: "TherapySessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TherapistOtherConditions",
                columns: table => new
                {
                    OtherConditionsId = table.Column<int>(type: "integer", nullable: false),
                    PhysicalTherapistsId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TherapistOtherConditions", x => new { x.OtherConditionsId, x.PhysicalTherapistsId });
                    table.ForeignKey(
                        name: "FK_TherapistOtherConditions_OtherConditions_OtherConditionsId",
                        column: x => x.OtherConditionsId,
                        principalTable: "OtherConditions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TherapistOtherConditions_PhysicalTherapists_PhysicalTherapi~",
                        column: x => x.PhysicalTherapistsId,
                        principalTable: "PhysicalTherapists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OtherConditions_Name",
                table: "OtherConditions",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SessionLogs_TherapySessionId",
                table: "SessionLogs",
                column: "TherapySessionId");

            migrationBuilder.CreateIndex(
                name: "IX_TherapistOtherConditions_PhysicalTherapistsId",
                table: "TherapistOtherConditions",
                column: "PhysicalTherapistsId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SessionLogs");

            migrationBuilder.DropTable(
                name: "TherapistOtherConditions");

            migrationBuilder.DropTable(
                name: "OtherConditions");

            migrationBuilder.AddColumn<int>(
                name: "PreferredDayOfWeek",
                table: "PatientPreferences",
                type: "integer",
                nullable: true);
        }
    }
}
