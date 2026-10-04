using System;
using System.Collections.Concurrent;

namespace agapay_backend.Services
{
  public class InMemoryRateLimiter : IRateLimiter
  {
    private readonly ConcurrentDictionary<string, SlidingWindow> _windows = new();

    // Every N acquisitions, drop fully-idle windows so per-user keys don't grow
    // unboundedly in a long-lived process. (A removed key is recreated on next use.)
    private const int SweepInterval = 256;
    private int _acquisitionCounter;

    public bool TryAcquire(string key, int limit, TimeSpan window, out TimeSpan retryAfter)
    {
      retryAfter = TimeSpan.Zero;
      var now = DateTime.UtcNow;

      MaybeSweepIdleWindows(now);

      var entry = _windows.GetOrAdd(key, _ => new SlidingWindow(limit));
      lock (entry)
      {
        entry.Trim(now, window);

        if (entry.Count >= limit)
        {
          retryAfter = entry.OldestRemaining(now, window);
          return false;
        }

        entry.Add(now);
        return true;
      }
    }

    private void MaybeSweepIdleWindows(DateTime now)
    {
      if (Interlocked.Increment(ref _acquisitionCounter) % SweepInterval != 0)
      {
        return;
      }

      foreach (var kvp in _windows)
      {
        lock (kvp.Value)
        {
          if (kvp.Value.Count == 0)
          {
            _windows.TryRemove(kvp.Key, out _);
          }
        }
      }
    }

    private sealed class SlidingWindow
    {
      private readonly int _limit;
      private readonly ConcurrentQueue<DateTime> _timestamps = new();

      public SlidingWindow(int limit)
      {
        _limit = limit;
      }

      public int Count => _timestamps.Count;

      public void Trim(DateTime now, TimeSpan window)
      {
        while (_timestamps.TryPeek(out var timestamp))
        {
          if ((now - timestamp) <= window)
          {
            break;
          }

          _timestamps.TryDequeue(out _);
        }
      }

      public void Add(DateTime timestamp)
      {
        _timestamps.Enqueue(timestamp);
      }

      public TimeSpan OldestRemaining(DateTime now, TimeSpan window)
      {
        if (!_timestamps.TryPeek(out var timestamp))
        {
          return TimeSpan.Zero;
        }

        var elapsed = now - timestamp;
        return elapsed >= window ? TimeSpan.Zero : window - elapsed;
      }
    }
  }
}
