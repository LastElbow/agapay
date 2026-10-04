using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddTherapistColleagueNetwork : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TherapistColleagues",
                columns: table => new
                {
                    TherapistId = table.Column<int>(type: "integer", nullable: false),
                    ColleagueId = table.Column<int>(type: "integer", nullable: false),
                    AddedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TherapistColleagues", x => new { x.TherapistId, x.ColleagueId });
                    table.CheckConstraint("CK_TherapistColleague_NotSelf", "\"TherapistId\" <> \"ColleagueId\"");
                    table.ForeignKey(
                        name: "FK_TherapistColleagues_PhysicalTherapists_ColleagueId",
                        column: x => x.ColleagueId,
                        principalTable: "PhysicalTherapists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TherapistColleagues_PhysicalTherapists_TherapistId",
                        column: x => x.TherapistId,
                        principalTable: "PhysicalTherapists",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TherapistColleagues_ColleagueId",
                table: "TherapistColleagues",
                column: "ColleagueId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TherapistColleagues");
        }
    }
}
