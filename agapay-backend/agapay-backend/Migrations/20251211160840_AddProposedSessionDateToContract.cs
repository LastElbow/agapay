using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace agapay_backend.Migrations
{
    /// <inheritdoc />
    public partial class AddProposedSessionDateToContract : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ProposedSessionDate",
                table: "Contracts",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProposedSessionDate",
                table: "Contracts");
        }
    }
}
