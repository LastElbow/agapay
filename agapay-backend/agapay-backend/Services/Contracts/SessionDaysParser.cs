namespace agapay_backend.Services.Contracts
{
    /// <summary>
    /// Date-parsing and Philippines-timezone helpers moved verbatim from
    /// ContractsController. The parsing here is intentionally fragile and
    /// load-bearing ("Saturday (Dec 13)" style SessionDays strings) — do not
    /// "fix" it; frontends depend on the exact behavior.
    /// </summary>
    public static class SessionDaysParser
    {
        public static DayOfWeek? ParseDayOfWeek(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;
            value = value.Trim();

            // Handle formats like "Saturday (Dec 13)" - extract just the day name
            // Take the first word before any parentheses, commas, or date info
            var firstWord = value.Split(new[] { ' ', '(', ',', '-' }, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
            if (!string.IsNullOrEmpty(firstWord))
            {
                value = firstWord.Trim();
            }

            if (Enum.TryParse<DayOfWeek>(value, true, out var parsed))
            {
                return parsed;
            }

            // Allow common abbreviations
            return value.ToLowerInvariant() switch
            {
                "mon" or "monday" => DayOfWeek.Monday,
                "tue" or "tues" or "tuesday" => DayOfWeek.Tuesday,
                "wed" or "weds" or "wednesday" => DayOfWeek.Wednesday,
                "thu" or "thur" or "thurs" or "thursday" => DayOfWeek.Thursday,
                "fri" or "friday" => DayOfWeek.Friday,
                "sat" or "saturday" => DayOfWeek.Saturday,
                "sun" or "sunday" => DayOfWeek.Sunday,
                _ => null,
            };
        }

        /// <summary>
        /// Parses dates from strings like "Saturday (Dec 13)" or "Monday (Jan 5)"
        /// Returns the actual DateTime for that date in the current year (or next year if the date has passed)
        /// </summary>
        public static DateTime? ParseDateFromSessionDays(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return null;

            // Try to extract date info from patterns like "Saturday (Dec 13)" or "Saturday, Dec 13"
            // Look for month abbreviations followed by day numbers
            var monthPatterns = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
            {
                ["jan"] = 1,
                ["january"] = 1,
                ["feb"] = 2,
                ["february"] = 2,
                ["mar"] = 3,
                ["march"] = 3,
                ["apr"] = 4,
                ["april"] = 4,
                ["may"] = 5,
                ["jun"] = 6,
                ["june"] = 6,
                ["jul"] = 7,
                ["july"] = 7,
                ["aug"] = 8,
                ["august"] = 8,
                ["sep"] = 9,
                ["sept"] = 9,
                ["september"] = 9,
                ["oct"] = 10,
                ["october"] = 10,
                ["nov"] = 11,
                ["november"] = 11,
                ["dec"] = 12,
                ["december"] = 12,
            };

            // Regex to find patterns like "Dec 13", "Jan 5", "December 25"
            var regex = new System.Text.RegularExpressions.Regex(
              @"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s*(\d{1,2})",
              System.Text.RegularExpressions.RegexOptions.IgnoreCase);

            var match = regex.Match(value);
            if (!match.Success) return null;

            var monthStr = match.Groups[1].Value.ToLower();
            var dayStr = match.Groups[2].Value;

            if (!monthPatterns.TryGetValue(monthStr.Length > 3 ? monthStr : monthStr, out var month))
            {
                // Try with just first 3 letters
                var shortMonth = monthStr.Length >= 3 ? monthStr.Substring(0, 3) : monthStr;
                if (!monthPatterns.TryGetValue(shortMonth, out month))
                    return null;
            }

            if (!int.TryParse(dayStr, out var day) || day < 1 || day > 31)
                return null;

            // Assume current year, but if the date has passed, use next year
            var now = DateTime.UtcNow;
            var year = now.Year;

            try
            {
                var result = new DateTime(year, month, day, 0, 0, 0, DateTimeKind.Utc);

                // If the date is more than a week in the past, assume it's for next year
                // But allow for dates within the past week (recent proposals)
                if (result < now.AddDays(-7))
                {
                    result = result.AddYears(1);
                }

                return result;
            }
            catch
            {
                return null;
            }
        }

        public static int CalculateDurationMinutes(TimeOnly start, TimeOnly end)
        {
            var startSpan = start.ToTimeSpan();
            var endSpan = end.ToTimeSpan();
            var diff = endSpan - startSpan;
            if (diff <= TimeSpan.Zero)
            {
                diff += TimeSpan.FromDays(1);
            }
            return (int)Math.Round(diff.TotalMinutes);
        }

        public static DateTime GetFirstOccurrence(DateTime reference, DayOfWeek targetDay, TimeOnly startTime, DateTime cutoffUtc)
        {
            var tz = ResolvePhilippinesTimeZone();

            var referenceLocal = NormalizeToPhilippinesLocal(reference, tz).Date;
            var daysOffset = ((int)targetDay - (int)referenceLocal.DayOfWeek + 7) % 7;
            var candidateLocal = referenceLocal.AddDays(daysOffset).Add(startTime.ToTimeSpan());

            var candidateUtc = ConvertPhilippinesLocalToUtc(candidateLocal, tz);
            var cutoff = EnsureUtc(cutoffUtc, tz);

            while (candidateUtc < cutoff)
            {
                candidateLocal = candidateLocal.AddDays(7);
                candidateUtc = ConvertPhilippinesLocalToUtc(candidateLocal, tz);
            }

            return candidateUtc;
        }

        public static DateTime Combine(DateTime date, TimeOnly time)
        {
            var tz = ResolvePhilippinesTimeZone();
            var localDate = NormalizeToPhilippinesLocal(date, tz).Date;
            var localDateTime = localDate.Add(time.ToTimeSpan());
            return ConvertPhilippinesLocalToUtc(localDateTime, tz);
        }

        public static TimeZoneInfo ResolvePhilippinesTimeZone()
        {
            // Shared resolution (same fallback chain) lives in Common/ManilaClock.cs
            return agapay_backend.Common.ManilaClock.Zone;
        }

        public static DateTime NormalizeToPhilippinesLocal(DateTime value, TimeZoneInfo tz)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => TimeZoneInfo.ConvertTimeFromUtc(value, tz),
                DateTimeKind.Local => TimeZoneInfo.ConvertTime(value, tz),
                _ => value,
            };
        }

        public static DateTime ConvertPhilippinesLocalToUtc(DateTime localValue, TimeZoneInfo tz)
        {
            var unspecified = DateTime.SpecifyKind(localValue, DateTimeKind.Unspecified);
            return TimeZoneInfo.ConvertTimeToUtc(unspecified, tz);
        }

        public static DateTime EnsureUtc(DateTime value, TimeZoneInfo tz)
        {
            return value.Kind switch
            {
                DateTimeKind.Utc => value,
                DateTimeKind.Local => value.ToUniversalTime(),
                _ => ConvertPhilippinesLocalToUtc(NormalizeToPhilippinesLocal(value, tz), tz),
            };
        }
    }
}
