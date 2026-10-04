using agapay_backend.Entities;
using System.Text.Json.Serialization;

namespace agapay_backend.Models
{
  public class EndContractDto
  {
    [JsonConverter(typeof(JsonStringEnumConverter))]
    public ContractStatus Status { get; set; }

    public string? Reason { get; set; }
  }
}
