# Agapay Perf + Stability Smoke Tests

Run these after each perf/stability batch. Goal: catch regressions fast (mobile + web).

## A. Auth / Token Refresh (5–10 min)

1. Login normally.
2. Background → foreground (mobile) / switch tabs + refocus (web) 3–5 times.
   - Expect: no repeated refresh storms, no repeated modals.
3. Force a 401 flow:
   - Easiest: leave app open until token expires, then navigate to a screen that calls the API.
   - Expect: refresh happens once, requests recover, no infinite loops.
4. Turn off internet temporarily and trigger an API call.
   - Expect: global “Connection Error” appears, app remains responsive.

## B. Chat (SignalR + rendering) (10 min)

1. Open a conversation.
2. Close the screen → reopen it 5 times.
   - Expect: incoming message events fire once (no duplicates).
3. With 100+ messages, scroll up/down.
   - Expect: smooth-ish scroll; sending a message should not freeze UI.
4. Send a message rapidly (3–5 messages).
   - Expect: no app freeze; if rate-limited, you see a sensible error once.

## C. Recommendations (5 min)

1. Go to recommendations results.
2. Scroll the therapist list aggressively.
   - Expect: less jank; no visible UI stalls when unrelated state changes.

## D. Sessions realtime (5 min)

1. Open session detail.
2. Navigate away and back.
   - Expect: no duplicated realtime events; timers behave.

## Quick notes to capture

- Platform: iOS/Android/Web
- Device (or browser)
- Any console warnings (duplicate handlers / setState on unmount)
- Any visible UI stalls + which screen
