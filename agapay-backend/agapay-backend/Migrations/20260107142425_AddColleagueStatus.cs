using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddColleagueStatus : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Status",
                table: "TherapistColleagues",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Status",
                table: "TherapistColleagues");
        }
    }
}
