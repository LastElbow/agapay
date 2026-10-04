using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMedicalConditionField : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MedicalCondition",
                table: "Patients");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MedicalCondition",
                table: "Patients",
                type: "text",
                nullable: true);
        }
    }
}
