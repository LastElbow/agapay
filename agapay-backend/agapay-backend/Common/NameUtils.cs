namespace agapay_backend.Common
{
  /// <summary>
  /// Shared name formatting for first/last name pairs (previously duplicated in
  /// 40+ sites as either $"{first} {last}".Trim() or a Join-Where-Select chain).
  /// </summary>
  public static class NameUtils
  {
    /// <summary>Joins first/last name, dropping null/whitespace parts. Output for
    /// ("John", null), (null, "Doe"), ("John", "Doe") is "John", "Doe", "John Doe";
    /// equivalent to the historical $"{first} {last}".Trim() and Join-variants.</summary>
    public static string FullName(string? firstName, string? lastName) =>
      string.Join(" ", new[] { firstName, lastName }
        .Where(s => !string.IsNullOrWhiteSpace(s))
        .Select(s => s!.Trim()));
  }
}
