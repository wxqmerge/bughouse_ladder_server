# Bughouse Chess Ladder - Administrator Manual

For standard game entry, error correction, and result formats, see the [User Manual](./USER_MANUAL.md).
**Access levels and API keys are documented in [SECURITY.md](./SECURITY.md).**

---

## Admin Mode

Admin mode is toggled via **Operations → Admin Mode**. Only one client per server can hold the lock; others will see an override dialog (30s countdown).

### Admin-Only Features
| Feature | Location | Purpose |
| :--- | :--- | :--- |
| **Load Data** | File → Load | Import `.tab`/`.xls`/`.txt` |
| **Export Data** | File → Export | Download current ladder |
| **Title Menu** | File → (dropdown) | Switch project title |
| **Sort Options** | Sort menu | Reorder player display |
| **Add Player** | Operations → Add Player | Create new player entries |
| **Delete Hidden** | Operations → Delete Hidden | Review/delete hidden players |
| **Restore Backup**| Operations → Restore Backup| Manage server backups |
| **Edit Title** | Header (click title) | Change ladder name |

**Visual Indicators:** File/Sort menus appear, Add Player/Delete Hidden options become visible, Trophy (T) column appears.

---

## Server & Settings

Access settings via **Operations → Settings**.

### Connection Modes
- **Local:** Uses browser `localStorage`.
- **Server:** Connects to production server (auto-detected via `GET /health`). Requires an API key for Admin mode.

### Settings Content (Admin Only)
| Section | Item | Description |
| :--- | :--- | :--- |
| **Configuration** | Show Ratings | Toggle visibility of rating columns |
| | Debug Level | 0 (all) to 10+ (critical) |
| | K-Factor | Elo volatility (default 20, range 1–100) |
| **Actions** | New Day | Finalize ratings, advance title, clear results |
| | New Day + Re-rank | Same as above, plus re-sort by rating |
| | Clear All | Wipe all player data from grid |
| | Set Sample Data | Reset to sample dataset |

---

## Player Management

### Adding & Editing
| Method | How to Use |
| :--- | :--- |
| **Dialog** | **Operations → Add Player** |
| **Inline Row** | Type in the empty row at bottom. **Ctrl+Enter** to create. |
| **Bulk Paste** | Copy spreadsheet rows → Click inline row → **Ctrl+V**. |
| **Main Table** | Click any cell in admin mode to edit. |

**Bulk Paste Mapping:** The starting column determines mapping (e.g., paste into **Group** → `Group \| LastName \| FirstName \| ...`).

### Hiding & Deleting
- **Hiding:** Add `x` to the end of a player's **Group** (e.g., `A1x`).
- **Deleting:** **Operations → Delete Hidden Players** cycles through all players with `x` in Group. If no `x` exists, it cycles through all players.

---

## Operations

### Recalculate_Save
**Operations → Recalculate_Save** validates results, calculates new ratings (using hybrid Elo/blending), and saves. 
- **K-Factor:** Configurable in Settings.
- **Trophy:** Any value containing "−" sets `trophyEligible: false`; otherwise `true`.

### New Day Processing
1. **Title Progression:** Cycles through tournament names.
2. **Rating Finalization:** "New Rating" moves to "Previous Rating"; `nRating` resets.
3. **Data Reset:** Game results cleared; attendance reset/incremented.
4. **Re-ranking:** Optional re-sort by rating.

### Backup System
Server maintains 20 automatic backups (`ladder_backup_YYYYMMDD_HHMMSS.tab`).
- **UI:** **Operations → Restore Backup** to browse, restore, or delete.
- **API:** `GET /api/admin/backups`, `POST /api/admin/backups/restore/:filename`, `DELETE /api/admin/backups/:filename`.

---

## Keyboard Shortcuts (Unique)

| Shortcut | Action |
| :--- | :--- |
| `Ctrl+1` | Switch to Club Ladder |
| `Ctrl+2`–`Ctrl+9` | Switch to Mini-game Ladders |
| `Ctrl+N` | Next error (Error Correction mode) |
| `Ctrl+P` | Previous error (Error Correction mode) |
| `Ctrl+X` | Cancel/Close dialog (Error Correction mode) |

---

## Troubleshooting

- **Sync Issues:** Check browser console; verify Server URL; check Network tab for failed `PUT` requests.
- **Rating Anomalies:** Run **Operations → Check Errors**; verify opponent entries match.
- **Server Down:** A ⚠️ **SERVER DOWN** badge appears. Admin mode still works locally; changes sync on reconnect.
- **Logs:** Use `sudo journalctl -u bughouse-ladder -f` for application logs.

---

## Appendix A: Rating Algorithm

Uses a **two-phase hybrid algorithm**:
1. **Phase 1 (Expected Score):** Logistic formula based on side ratings (average of teammates for 4-player).
2. **Phase 2 (Performance):** Accumulates $\pm 0.5$ per result.
3. **Phase 3 (Update):**
   - **$\le 9$ games (Blending):** $New\ nRating = \text{abs}(\frac{Old\_nRating \times Games \times BlendingFactor + PerfRating}{Games + 1})$
   - **$\ge 10$ games (Elo):** $New\ nRating = \text{abs}(Old\_nRating + (WLD\_Perfs + ExpectedMult \times (0.5 - Expected)) \times K\_Factor)$

---

## Appendix B: Admin API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/admin/upload` | Upload `.tab`/`.xls` |
| `GET` | `/api/admin/export` | Export as `.tab` |
| `GET` | `/api/admin/backups` | List backups |
| `POST` | `/api/admin/backups/restore/:filename` | Restore backup |
| `DELETE` | `/api/admin/backups/:filename` | Delete backup |
| `POST` | `/api/admin/tournament/save-mini-game` | Save mini-game |
| `GET` | `/api/admin/tournament/read-mini-game` | Read mini-game |
| `POST` | `/api/admin/tournament/write-mini-game` | Write mini-game |
| `POST` | `/api/admin/tournament/copy-players` | Copy players to mini-game |
| `GET` | `/api/admin/tournament/export` | Export tournament (ZIP) |
| `GET` | `/api/admin/tournament/trophies` | Generate trophy report |
| `POST` | `/api/admin/tournament/import` | Import mini-game files |
| `POST` | `/api/admin/tournament/clear-mini-games` | Clear all mini-games |
| `POST` | `/api/admin/tournament/add-player-to-mini-games` | Add player to all mini-games |
| `GET` | `/api/admin/tournament/check-mini-games` | Check for mini-game data |
| `GET` | `/api/admin/export-mini-data` | Export all data (ZIP) |

---

## Appendix C: Print Label Layout API

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/print-layouts` | None | List all saved layouts |
| `POST` | `/api/print-layouts` | User Key | Create or update a layout |
| `DELETE` | `/api/print-layouts/:name` | User Key | Delete a layout by name |

**Data File:** `server/data/print_layouts.json`

**Layout Object:**
```json
{
  "name": "My Layout",
  "labelsPerPage": 20,
  "marginTop": 0,
  "marginBottom": 0,
  "columnOffsets": [0, 0],
  "fields": {
    "firstName": { "x": 0.8, "y": 27.7, "fontSize": 30 },
    "lastName": { "x": 24.8, "y": 69.2, "fontSize": 12 }
  }
}
```

- **`labelsPerPage`:** 20 or 30
- **`marginTop` / `marginBottom`:** % of cell height (0–100)
- **`columnOffsets`:** array of % per column (-5 to +5), shifts all fields in that column
- **`fields`:** per-field positioning — `x` (left %), `y` (top %), `fontSize` (pt, 0 = CSS default)
