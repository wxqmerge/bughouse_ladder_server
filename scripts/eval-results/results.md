# LLM Model Evaluation Results

**Date:** 2026-06-03
**Models tested:** 1/10 (9 skipped)

## Summary

| Model | Batch | Score | Pass Rate | Pass Time | Gen TPS | Draft Rate | Status | Tasks |
|-------|-------|-------|-----------|-----------|---------|------------|--------|-------|
| gemma-4-26B-A4B-it-Q8_0 | runGMoEq8.bat | 21/30 | 73.3% | 82.1s | 194.37 | - | OK | 15/15 |

## By Difficulty

| Model | Easy | Medium | Hard |
|-------|------|--------|------|
| gemma-4-26B-A4B-it-Q8_0 | 4 | 8 | 9 |

## Performance by Difficulty

| Model | Easy TPS | Medium TPS | Hard TPS | Easy Draft | Medium Draft | Hard Draft |
|-------|----------|------------|----------|------------|--------------|------------|
| gemma-4-26B-A4B-it-Q8_0 | 195.0 | 194.9 | 193.2 | - | - | - |

## By Category

| Model | Parsing | Utility | React | Backend |
|-------|---------|---------|-------|---------|
| gemma-4-26B-A4B-it-Q8_0 | 6 | 12 | 0 | 3 |

## Per-Task Results

### gemma-4-26B-A4B-it-Q8_0 (21/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | TSC_FAIL | 0/1 | 189.603567916984 | - | 21848ms |
| task02 | Format player name for display | PASS | 1/1 | 195.9362101624901 | - | 7221ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 197.8438503478464 | - | 3050ms |
| task04 | Validate ladder name | PASS | 1/1 | 193.4917625909549 | - | 13406ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 197.9804922510115 | - | 4000ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 197.29377867783697 | - | 4146ms |
| task07 | Format game result for display | PASS | 2/2 | 193.93230609116426 | - | 11333ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 193.91170509308677 | - | 12273ms |
| task09 | Create debounce utility | PASS | 2/2 | 196.63113118150775 | - | 6248ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 192.97554759750074 | - | 14215ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 196.09750835178784 | - | 6226ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 189.66306652580232 | - | 21763ms |
| task13 | Batch cell correction state management | PASS | 3/3 | 193.8840251705691 | - | 10583ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 189.3076751182653 | - | 21892ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 196.997655977258 | - | 3587ms |

