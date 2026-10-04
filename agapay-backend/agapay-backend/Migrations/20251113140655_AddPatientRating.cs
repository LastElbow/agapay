using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddPatientRating : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PatientRatings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PatientId = table.Column<int>(type: "integer", nullable: false),
                    PhysicalTherapistId = table.Column<int>(type: "integer", nullable: false),
                    SessionId = table.Column<int>(type: "integer", nullable: true),
                    Score = table.Column<byte>(type: "smallint", nullable: false),
                    Comment = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientRatings_Patients_PatientId",
                        column: x => x.PatientId,
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PatientRatings_PhysicalTherapists_PhysicalTherapistId",
                        column: x => x.PhysicalTherapistId,
                        principalTable: "PhysicalTherapists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PatientRatings_TherapySessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "TherapySessions",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_PatientRatings_PatientId",
                table: "PatientRatings",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientRatings_PhysicalTherapistId",
                table: "PatientRatings",
                column: "PhysicalTherapistId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientRatings_SessionId",
                table: "PatientRatings",
                column: "SessionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PatientRatings");
        }
    }
}
