using System.Collections.Generic;

namespace agapay_backend.Models
{
    public class ConditionGroupDto
    {
        public string Key { get; init; } = string.Empty;
        public string Label { get; init; } = string.Empty;
        public IReadOnlyCollection<ConditionItemDto> Items { get; init; } = System.Array.Empty<ConditionItemDto>();
    }

    public class ConditionItemDto
    {
        public int Id { get; init; }
        public string Name { get; init; } = string.Empty;
    }
}
