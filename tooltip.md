# Proposed Tooltips for Bughouse Ladder

Pattern: `useTooltips` hook (same as hiker app). Each element gets `title={tt("description")}`.
Tooltips are enabled by default, toggleable via settings.

---

## Menu Bar (MenuBar.tsx)

### Menu Triggers
| Element | Tooltip |
|---------|---------|
| File | "Load or export ladder data" |
| Sort | "Sort players by different criteria" |
| Operations | "Recalculate, enter games, manage players, and more" |
| View | "Adjust zoom level and view options" |

### File Menu Items
| Element | Tooltip |
|---------|---------|
| Load | "Load a new .tab file to replace current ladder data" |
| Export | "Download current ladder data as a .tab file" |

### Title Menu Items (File > submenu)
| Element | Tooltip |
|---------|---------|
| Ladder | "Main club ladder (ladder.tab)" |
| Mini-game titles (e.g., Nov16, Nov23, etc.) | "Switch to mini-game tournament: {title}" |

### Sort Menu Items
| Element | Tooltip |
|---------|---------|
| By Rank | "Sort by current rank order" |
| By Last Name | "Sort alphabetically by last name" |
| By First Name | "Sort alphabetically by first name" |
| By New Rating | "Sort by calculated new rating (high to low)" |
| By Previous Rating | "Sort by previous rating (high to low)" |

### Operations Menu Items
| Element | Tooltip |
|---------|---------|
| Recalculate_Save | "Recalculate all ratings from game results and save" |
| Check Errors | "Check for data entry errors in game results" |
| Enter Games | "Enter or correct game results" |
| Paste Multiple Results | "Paste multiple game results from clipboard at once" |
| Add Player | "Add a new player to the ladder" |
| Delete Players | "Delete hidden players (group ending in X)" |
| Auto-Letter | "Auto-generate tournament letters for players" |
| Admin Mode / Exit Admin Mode | "Toggle admin mode for write access" |
| Restore Backup | "Restore ladder data from a previous backup" |
| Print Labels | "Print player labels for tournaments" |
| Settings | "Open settings dialog (K-factor, debug level, server config)" |

### View Menu Items
| Element | Tooltip |
|---------|---------|
| Zoom 50% | "Set table zoom to 50%" |
| Zoom 70% | "Set table zoom to 70%" |
| Zoom 100% | "Set table zoom to 100% (default)" |
| Zoom 140% | "Set table zoom to 140%" |
| Zoom 200% | "Set table zoom to 200%" |
| Round Robin | "Toggle round-robin view showing matchups (max of 31 players)" |

### Menu Bar Info
| Element | Tooltip |
|---------|---------|
| Total Players | "Number of players currently loaded" |

---

## LadderForm Column Headers

| Element | Tooltip |
|---------|---------|
| Rnk | "Player rank on the ladder" |
| Group | "Player group (A1-A8, I1-I8, Z1-Z8, etc.)" |
| Last Name | "Player last name" |
| First Name | "Player first name" |
| Previous Rating | "Rating before today's games" |
| New Rating | "Calculated rating after today's games" |
| T (Trophy) | "Trophy eligibility flag" |
| Gr (Grade) | "Player grade level" |
| Gms (Games) | "Number of games played" |
| Attend (Attendance) | "Attendance record" |
| Phone | "Player phone number" |
| I (Info) | "Additional player information" |
| S (School) | "Player school" |
| R (Room) | "Player room assignment" |
| Round 1-31 | "Game result for round {N}. Enter: W (win), L (loss), D (draw), or blank" |

---

## Settings Panel (Settings.tsx)

### Configuration Section
| Element | Tooltip |
|---------|---------|
| Show ratings | "Show/hide rating columns in the ladder table" |
| A1-A8, I1-I8, Z1-Z8 groups | "Rating groups displayed when 'Show ratings' is enabled" |
| Debug Level | "Controls console log verbosity" |
| 0=all logs, 5=default, 10+=critical | "Higher values show fewer logs" |
| K-Factor (Elo volatility) | "Controls how much ratings change per game" |
| Higher = faster rating changes (1-100) | "Default is 20. Higher values make ratings more volatile" |

### Actions Section
| Element | Tooltip |
|---------|---------|
| Walk Through Reports | "Step through game-by-game rating calculations" |
| Generate Trophies | "Generate trophy report for all players and mini-games" |
| Generate Activity Report | "Generate a report of player activity and game counts" |
| New Day | "Start a new day: copy New Rating to Previous Rating, clear reports" |
| New Day + Re-rank | "Start a new day and re-rank players by rating" |
| Export Tournament Files | "Export all mini-game .tab files as a ZIP archive" |
| Import Single Mini-Game | "Import a single .tab file into a mini-game slot" |
| Import Tournament Files | "Import multiple .tab files from a ZIP archive" |
| Clear Mini-Games | "Remove all 7 mini-game .tab files" |
| Clear All | "Clear all game results, keep player data intact" |
| Set Sample Data | "Reset to sample data for testing" |

### Server Connection Section
| Element | Tooltip |
|---------|---------|
| Server Connection | "Configure connection to the ladder server" |
| Enter Admin Mode | "Enter admin mode to access configuration and actions" |
| Exit Admin Mode | "Exit admin mode and release the admin lock" |
| Test Mode | "Enable random result buttons in Enter Games mode for testing" |
| Restore Last Server Config | "Restore the last working server URL and API key" |
| Server URL | "URL of the ladder server" |
| Leave empty for local mode | "When empty, data is stored in browser localStorage only" |
| API Key | "API key for server authentication" |
| Required if server has admin protection | "Provided by the server administrator" |

---

## Mobile Menu (MobileMenu.tsx)

Same items as MenuBar, but as a side panel. Same tooltips apply.

---

## Status Banner / App-level

| Element | Tooltip |
|---------|---------|
| SERVER DOWN | "Connection to server is lost. Working with local data." |
| Sync status indicators | "Shows current sync state with the server" |

---

## Toggle Tooltips Control

A small toggle button in Settings to enable/disable tooltips (stored in `localStorage` as `ladder-tooltips-enabled`). Default: enabled.

---

## Notes

- Tooltips use `title={tt("...")}` pattern — `tt` returns `undefined` when tooltips are disabled, so no `title` attribute is rendered.
- Round-robin round headers (showing rank numbers instead of "Round N") get no tooltip — the rank number is self-explanatory.
- Game result cells (W/L/D) are not individual text elements — the column header tooltip covers the meaning.
