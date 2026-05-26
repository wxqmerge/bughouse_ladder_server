# Manual Testing Checklist

## Debug Level Reference
- **1:** All logs (most verbose)
- **2:** Per-match/per-player trace (`[PASS 1]`, `[PARSE_DEBUG]`, `[UPDATE_DEBUG]`)
- **3:** Per-match repopulate (`[REPOPULATE_DEBUG]`, ErrorDialog UI extras)
- **4:** (reserved)
- **5:** Trophy headers (default)
- **7:** Recalc trace object (disabled by default, default is 9)
- **9:** Init/sync logs (default)

---

## Tests

- [ ] **1. Settings UI** — debugLevel selector renders, saves, persists across reload
- [ ] **2. Disconnect → reload** — clear server URL, save, hard reload → stays in local mode (no splash repopulation)
- [x] **3. Connect via URL** — `?config=1&server=URL&key=KEY` → connects, params cleared after apply
- [ ] **4. Full reset** — `?config=2` → clears all data, stays in local mode after reload
- [ ] **5. Force local** — `?config=4` → disconnects server, blocks auto-detect, preserves data
- [ ] **6. File import** — drop `.tab`/`.xls` on splash → loads
- [ ] **7. Mini-game tournament import** — end-to-end with real data
- [ ] **8. ErrorDialog UI extras** — visible at debugLevel ≤ 3, hidden at 5+
- [x] **9. SSE real-time sync** — two browser tabs, edit in one, see update in other
- [ ] **10. Push/Pull buttons** — reconnect after disconnect, data merge direction
- [ ] **11. Server auto-detect** — no config → `/health` check → SERVER vs LOCAL mode
- [ ] **12. localStorage persistence** — close browser, reopen → settings/data intact
- [ ] **13. Trophy report generation** — real ladder data, debugLevel ≤ 5 shows headers
- [ ] **14. Recalc verbose output** — debugLevel ≤ 2 shows `[PASS 1]`/`[PASS 2]` logs in console

## Debug Console Tags
Search for these in DevTools console to verify behavior:

| Tag | Fires When |
|---|---|
| `[TEST_DEBUG]` | All manual test checkpoints |
| `[PARSE_DEBUG]` | `debugLevel ≤ 2` — per game result parsed |
| `[REPOPULATE_DEBUG]` | `debugLevel ≤ 3` — per match repopulated |
| `[UPDATE_DEBUG]` | `debugLevel ≤ 2` — per game entry typed/parsed |
| `[PASS 1]` / `[PASS 2]` | `debugLevel ≤ 2` — recalc trace |
| `[Config]` | URL config applied, before/after clear |
| `[mode.ts]` | Connection state init, auto-detect |
