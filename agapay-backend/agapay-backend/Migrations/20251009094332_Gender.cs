using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class Gender : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Gender",
                table: "PhysicalTherapists",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Gender",
                table: "Patients",
                type: "text",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Gender",
                table: "PhysicalTherapists");

            migrationBuilder.DropColumn(
                name: "Gender",
                table: "Patients");
        }
    }
}
