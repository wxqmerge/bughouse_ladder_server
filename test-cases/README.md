# Manual Test Runner

## Quick Start

### Access Test Runner
Press **Ctrl+T** while in the app to toggle the test runner panel.

---

## How to Run a Manual Test

### Example: Running "01-kings-cross" Test

**Test Definition** (`01-kings-cross.json`):
```json
{
  "name": "01-kings-cross",
  "inputFilePath": "kings_cross.tab",
  "expectedOutputFile": "test-cases/kings_cross.tab",
  "actions": [
    { "type": "clickMenu", "menu": "Operations" },
    { "type": "selectMenuItem", "item": "Recalculate Ratings" }
  ]
}
```

### Step-by-Step Instructions:

**1. Load Input Data**
   - Open browser DevTools → Application → Local Storage
   - Clear existing data (optional)
   - Go to main app, use "Paste Results" feature
   - Paste contents of `kings_cross.tab` file

**2. Execute Test Actions**
   - Click "Operations" menu
   - Select "Recalculate Ratings"
   - Wait for calculation to complete

**3. Export Results**
   - Click "File" menu (or equivalent export button)
   - Select "Export"
   - Save the exported `.tab` file

**4. Compare with Expected Output**
   - Open exported file and `kings_cross_expected_output.tab`
   - Compare line by line or use a diff tool
   - Results should match exactly

---

## Available Test Cases

| File | Description | Input File | Actions |
|------|-------------|------------|--------|
| `01-kings-cross.json` | Basic recalculate test | `kings_cross.tab` | Recalculate ratings twice |
| `02-basic_File_IO.json` | File import/export | `basic_File_IO.tab` | Import, export, verify |
| `03-recalculate-ratings.json` | Rating calculation | `recalculate_ratings.tab` | Multiple recalculations |
| `04-paste-results.json` | Paste game results | `paste_results.tab` | Paste results feature |
| `05-title-and-new-day.json` | New day processing | Various | Title change, new day |
| `06-pawn-game-recalculate.json` | Pawn game handling | `pawn_game_recalculate.json` | Special game type |

---

## Verifying Test Results

### Automated Comparison (PowerShell)
```powershell
# Compare exported file with expected output
$exported = Get-Content "export_*.tab" -Raw
$expected = Get-Content "test-cases/kings_cross_expected_output.tab" -Raw

if ($exported -eq $expected) {
    Write-Host "✓ TEST PASSED" -ForegroundColor Green
} else {
    Write-Host "✗ TEST FAILED" -ForegroundColor Red
    # Show differences
    diff "export_*.tab" "test-cases/kings_cross_expected_output.tab"
}
```

### Manual Verification
1. Open both files in a text editor (Notepad++, VS Code)
2. Use side-by-side comparison feature
3. Verify all values match

---

## Debugging Failed Tests

**Common Issues:**

1. **Data not loaded correctly**
   - Check DevTools Console for errors
   - Verify localStorage has `ladder_ladder_players` key
   - Inspect parsed data structure

2. **Rating calculation differs**
   - Verify input data matches expected format
   - Check for floating-point precision issues
   - Review rating algorithm in code

3. **Export format incorrect**
   - Check column order matches original
   - Verify tab separators (not commas)
   - Ensure no extra whitespace

---

## Creating New Test Cases

### Template:
```json
{
  "name": "XX-test-name",
  "inputFilePath": "input_file.tab",
  "expectedOutputFile": "test-cases/expected_output.tab",
  "actions": [
    { "type": "clickMenu", "menu": "Menu Name" },
    { "type": "selectMenuItem", "item": "Item Name" }
  ],
  "clickMenu": "Final Export Menu",
  "selectMenuItem": "Export"
}
```

### Action Types:
- `clickMenu` - Click a menu button
- `selectMenuItem` - Select a menu item
- `pasteResults` - Paste game results into input
- `enterData` - Enter data in a specific field

---

## Notes

- All test data is stored in localStorage
- Clear browser data between tests for clean state
- Test runner logs are visible in the panel
- Use browser DevTools Network tab to verify API calls (server mode)
