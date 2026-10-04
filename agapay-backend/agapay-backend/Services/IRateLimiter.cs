using System;

namespace agapay_backend.Services
{
  public interface IRateLimiter
  {
    bool TryAcquire(string key, int limit, TimeSpan window, out TimeSpan retryAfter);
  }
}
