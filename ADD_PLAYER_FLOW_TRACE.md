# Add Player Flow — Enter Games Mode (Console Trace)

## Prerequisites
- Admin API key configured in user settings (`loadUserSettings().apiKey`)
- Server running at `http://localhost:3000`
- Admin lock released (if locked)

## Flow Steps

### 1. Enter Games Mode
```
LadderForm.tsx:1228 >>> [MENU ACTION] Enter Games
LadderForm.tsx:1232 >>> [ENTER_GAMES] Exiting admin mode
requestGate.ts:37 Fetch finished loading: POST "http://localhost:3000/api/admin-lock/release"
```
- User clicks "Enter Games" in the file menu
- Admin mode is exited, admin lock released on server

### 2. Enter Game Result (triggers error)
```
log.ts:15 [ENTER_GAMES] Active file: ladder.tab | Entered "5W16" for cell P1 R1
log.ts:15 [ENTER_GAMES] 2P OUTPUT: "5W16_"
log.ts:15 [ENTER_GAMES] Invalid player reference(s): 16
```
- User types `5W16` into a game result cell (P1 R1 = Player 1, Round 1)
- Parse succeeds for score (`5W`) but player rank `16` doesn't exist yet
- Error dialog opens with error 11 (invalid player reference)

### 3. Add Player via Inline Button
```
ErrorDialog.tsx:1447 >>> [BUTTON PRESSED] + Add Player (Rank 16) [inline enter-games]
```
- User clicks the inline "+ Add Player (Rank 16)" button in the error dialog
- `AddPlayerDialog` opens with rank pre-filled to `16`

### 4. Fill Player Details & Submit
```
debug.ts:32 [INPUT]->AddPlayer:Last Name = "mahowald"
debug.ts:32 [INPUT]->AddPlayer:First Name = "matt"
debug.ts:32 [INPUT]->AddPlayer:Rating = "2200"
debug.ts:32 [INPUT]->AddPlayer:Grade = "13"
AddPlayerDialog.tsx:XX >>> [BUTTON PRESSED] Trophy Toggle [AddPlayerDialog] -> +
AddPlayerDialog.tsx:59 >>> [BUTTON PRESSED] Add Player [submit] - Rank: 16, Name: matt mahowald
LadderForm.tsx:3295 >>> [ACTION] handleAddPlayerSubmit - Rank: 16, Name: matt mahowald
LadderForm.tsx:3356 New player added successfully
```
- User enters: Last Name `mahowald`, First Name `matt`, Rating `2200`, Grade `13`
- User toggles Trophy `+`/`-` button (default: `+` eligible, click to toggle to `-` ineligible)
- Submits → `handleAddPlayerSubmit` adds player at rank 16 with selected `trophyEligible` value
- Player added to both `players` and `pendingPlayers` arrays
- Data pushed to server via PUT `/api/ladder`

### 5. Server Sync & SSE Broadcast
```
dataService.ts:130 [DataService] SSE: ladderUpdated
requestGate.ts:37 Fetch finished loading: PUT "http://localhost:3000/api/ladder"
App.tsx:152 [APP] Data changed - notifying LadderForm
log.ts:15 [REFRESH] Refreshing players using dataService
log.ts:15 [REFRESH] ✓ Refreshed 16 players
dataService.ts:275 [DataService] Reset hash after save
App.tsx:152 [APP] Data changed - notifying LadderForm
log.ts:15 [REFRESH] Refreshing players using dataService
log.ts:15 [REFRESH] ✓ Refreshed 16 players
```
- Server receives PUT, persists player, broadcasts SSE `ladderUpdated`
- Client receives SSE, triggers data change notification
- Two refresh cycles: first from PUT callback, second from hash reset
- Player count confirms 16 players loaded

### 6. Save Game Result
```
ErrorDialog.tsx:462 >>> [BUTTON PRESSED] Save (Game Result)
LadderForm.tsx:2420 Rating calculation complete
dataService.ts:130 [DataService] SSE: ladderUpdated
requestGate.ts:37 Fetch finished loading: PUT "http://localhost:3000/api/ladder"
App.tsx:152 [APP] Data changed - notifying LadderForm
log.ts:15 [REFRESH] Refreshing players using dataService
log.ts:15 [REFRESH] ✓ Refreshed 16 players
dataService.ts:275 [DataService] Reset hash after save
App.tsx:152 [APP] Data changed - notifying LadderForm
log.ts:15 [REFRESH] Refreshing players using dataService
log.ts:15 [REFRESH] ✓ Refreshed 16 players
```
- User clicks "Save (Game Result)" in the error dialog
- `handleSubmit` runs rating calculation, then pushes updated ladder to server
- Same SSE broadcast → refresh cycle pattern as step 5
- Data hash reset confirms clean save state

## Key Implementation Details

| Step | Component | Function | Purpose |
|------|-----------|----------|---------|
| 1 | `LadderForm.tsx` | menu action handler | Enter games mode, release admin lock |
| 2 | `LadderForm.tsx` | `fillCell` + validation | Parse game string, detect missing player ref |
| 3 | `ErrorDialog.tsx` | inline button click | Open `AddPlayerDialog` with pre-filled rank |
| 4 | `AddPlayerDialog.tsx` | Trophy toggle button | Set `trophyEligible` (`+` eligible, `-` ineligible) |
| 4 | `LadderForm.tsx` | `handleAddPlayerSubmit` | Add player to `players` + `pendingPlayers`, PUT to server |
| 5 | `dataService.ts` | SSE listener | Broadcast → refresh → hash reset |
| 6 | `ErrorDialog.tsx` | `handleSubmit` | Rating calc → PUT `/api/ladder` → SSE broadcast |

## State Flow
```
Enter Games → Type "5W16" → Validation error (player 16 missing)
  → Click "+ Add Player (Rank 16)" → Fill form → Toggle Trophy +/- → Submit
    → Player added, PUT to server → SSE broadcast → Refresh (16 players)
      → Click "Save (Game Result)" → Rating calc → PUT to server → SSE broadcast → Refresh (16 players)
        → Error dialog closes, game result saved
```

## Recent Changes
- **2026-05-26:** Removed `console.clear()` calls from `ErrorDialog.tsx` (lines 462, 472) and `LadderForm.tsx` (line 1495) to preserve full console trace through add player flow.
- **2026-05-26:** Added Trophy `+`/`-` toggle button to `AddPlayerDialog.tsx`. New player `trophyEligible` is no longer hardcoded to `true`; user can toggle before submitting.
