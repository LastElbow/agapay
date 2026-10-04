using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class ContractBasedRatings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM \"TherapistRatings\";");
            migrationBuilder.Sql("DELETE FROM \"PatientRatings\";");

            migrationBuilder.DropForeignKey(
                name: "FK_PatientRatings_TherapySessions_SessionId",
                table: "PatientRatings");

            migrationBuilder.DropForeignKey(
                name: "FK_TherapistRatings_TherapySessions_SessionId",
                table: "TherapistRatings");

            migrationBuilder.DropIndex(
                name: "IX_TherapistRatings_SessionId",
                table: "TherapistRatings");

            migrationBuilder.DropIndex(
                name: "IX_PatientRatings_SessionId",
                table: "PatientRatings");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "TherapistRatings");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "PatientRatings");

            migrationBuilder.AddColumn<int>(
                name: "ContractId",
                table: "TherapistRatings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "ContractId",
                table: "PatientRatings",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_TherapistRatings_ContractId",
                table: "TherapistRatings",
                column: "ContractId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientRatings_ContractId",
                table: "PatientRatings",
                column: "ContractId");

            migrationBuilder.AddForeignKey(
                name: "FK_PatientRatings_Contracts_ContractId",
                table: "PatientRatings",
                column: "ContractId",
                principalTable: "Contracts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_TherapistRatings_Contracts_ContractId",
                table: "TherapistRatings",
                column: "ContractId",
                principalTable: "Contracts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_PatientRatings_Contracts_ContractId",
                table: "PatientRatings");

            migrationBuilder.DropForeignKey(
                name: "FK_TherapistRatings_Contracts_ContractId",
                table: "TherapistRatings");

            migrationBuilder.DropIndex(
                name: "IX_TherapistRatings_ContractId",
                table: "TherapistRatings");

            migrationBuilder.DropIndex(
                name: "IX_PatientRatings_ContractId",
                table: "PatientRatings");

            migrationBuilder.DropColumn(
                name: "ContractId",
                table: "TherapistRatings");

            migrationBuilder.DropColumn(
                name: "ContractId",
                table: "PatientRatings");

            migrationBuilder.AddColumn<int>(
                name: "SessionId",
                table: "TherapistRatings",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SessionId",
                table: "PatientRatings",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_TherapistRatings_SessionId",
                table: "TherapistRatings",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientRatings_SessionId",
                table: "PatientRatings",
                column: "SessionId");

            migrationBuilder.AddForeignKey(
                name: "FK_PatientRatings_TherapySessions_SessionId",
                table: "PatientRatings",
                column: "SessionId",
                principalTable: "TherapySessions",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_TherapistRatings_TherapySessions_SessionId",
                table: "TherapistRatings",
                column: "SessionId",
                principalTable: "TherapySessions",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
