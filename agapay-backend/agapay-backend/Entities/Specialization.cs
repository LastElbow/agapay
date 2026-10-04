namespace agapay_backend.Entities
{
    public class Specialization
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;

        public ICollection<PhysicalTherapist> PhysicalTherapists { get; } = new List<PhysicalTherapist>();
    }
}
