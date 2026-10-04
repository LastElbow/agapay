using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class RenameOrthopedicMusculoskeletal : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Update the Orthopedic specialization to Orthopedic/Musculoskeletal
            migrationBuilder.Sql(
                "UPDATE \"Specializations\" SET \"Name\" = 'Orthopedic/Musculoskeletal' WHERE \"Name\" = 'Orthopedic'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Revert to original name
            migrationBuilder.Sql(
                "UPDATE \"Specializations\" SET \"Name\" = 'Orthopedic' WHERE \"Name\" = 'Orthopedic/Musculoskeletal'");
        }
    }
}
