using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class RemoveTherapistLocationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Address",
                table: "PhysicalTherapists");

            migrationBuilder.DropColumn(
                name: "Barangay",
                table: "PhysicalTherapists");

            migrationBuilder.DropColumn(
                name: "Latitude",
                table: "PhysicalTherapists");

            migrationBuilder.DropColumn(
                name: "Longitude",
                table: "PhysicalTherapists");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Address",
                table: "PhysicalTherapists",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Barangay",
                table: "PhysicalTherapists",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Latitude",
                table: "PhysicalTherapists",
                type: "double precision",
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "Longitude",
                table: "PhysicalTherapists",
                type: "double precision",
                nullable: true);
        }
    }
}
