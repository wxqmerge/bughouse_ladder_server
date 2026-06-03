# LLM Model Evaluation Results

**Date:** 2026-06-03
**Models tested:** 9/9 (0 skipped)

## Summary

| Model | Batch | Score | Pass Rate | Pass Time | Gen TPS | Draft Rate | Status | Tasks |
|-------|-------|-------|-----------|-----------|---------|------------|--------|-------|
| Qwen3.6-27B-UD-Q5_K_XL | runq36_27B.bat | 22/30 | 80.0% | 392.3s | 66.12 | - | OK | 15/15 |
| gemma-4-26B-A4B-it-UD-Q6_K | runGMoE.bat | 21/30 | 73.3% | 101.3s | 197.61 | - | OK | 15/15 |
| Qwen3 | runq36MTP27B_n2.bat | 19/30 | 73.3% | 188.9s | 128.05 | 83.9% | OK | 15/15 |
| Qwen3 | runq36MTP27B_n4.bat | 17/30 | 66.7% | 168.2s | 142 | 69.8% | OK | 15/15 |
| Qwen3 | runq36MTP27B.bat | 17/30 | 66.7% | 173.5s | 134.22 | 76.7% | OK | 15/15 |
| Qwen3 | runq36MTP_n2.bat | 16/30 | 60.0% | 60.5s | 267.42 | 81.7% | OK | 15/15 |
| Qwen3 | runq36MTP.bat | 14/30 | 53.3% | 48.3s | 273.9 | 75.4% | OK | 15/15 |
| Qwen3 | runq36MTP_n4.bat | 12/30 | 46.7% | 42.0s | 282.99 | 67.4% | OK | 15/15 |
| Huihui-Qwen3.6-35B-A3B-Claude-4.7-Opus-abliterated-ggml-model-Q6_K | runq36.bat | 7/30 | 40.0% | 122.9s | 9.73 | - | CRASHED | 7/15 |

## By Difficulty

| Model | Easy | Medium | Hard |
|-------|------|--------|------|
| Qwen3.6-27B-UD-Q5_K_XL | 5 | 8 | 9 |
| gemma-4-26B-A4B-it-UD-Q6_K | 4 | 8 | 9 |
| Qwen3 | 5 | 8 | 6 |
| Qwen3 | 5 | 6 | 6 |
| Qwen3 | 5 | 6 | 6 |
| Qwen3 | 4 | 6 | 6 |
| Qwen3 | 4 | 4 | 6 |
| Qwen3 | 3 | 6 | 3 |
| Huihui-Qwen3.6-35B-A3B-Claude-4.7-Opus-abliterated-ggml-model-Q6_K | 5 | 2 | 0 |

## Performance by Difficulty

| Model | Easy TPS | Medium TPS | Hard TPS | Easy Draft | Medium Draft | Hard Draft |
|-------|----------|------------|----------|------------|--------------|------------|
| Qwen3.6-27B-UD-Q5_K_XL | 66.1 | 66.1 | 66.1 | - | - | - |
| gemma-4-26B-A4B-it-UD-Q6_K | 197.2 | 198.7 | 196.9 | - | - | - |
| Qwen3 | 127.7 | 129.7 | 126.7 | 83.7% | 86.5% | 83.9% |
| Qwen3 | 139.1 | 144.9 | 142.0 | 69.3% | 73.6% | 71.9% |
| Qwen3 | 134.6 | 136.0 | 132.1 | 77.3% | 78.9% | 77.5% |
| Qwen3 | 270.8 | 266.2 | 265.0 | 85.5% | 88.2% | 81.3% |
| Qwen3 | 275.8 | 270.6 | 274.7 | 79.0% | 79.6% | 77.5% |
| Qwen3 | 280.0 | 290.4 | 280.0 | 68.4% | 73.8% | 67.6% |
| Huihui-Qwen3.6-35B-A3B-Claude-4.7-Opus-abliterated-ggml-model-Q6_K | 9.7 | 9.7 | - | - | - | - |

## By Category

| Model | Parsing | Utility | React | Backend |
|-------|---------|---------|-------|---------|
| Qwen3.6-27B-UD-Q5_K_XL | 7 | 12 | 0 | 3 |
| gemma-4-26B-A4B-it-UD-Q6_K | 6 | 12 | 0 | 3 |
| Qwen3 | 7 | 9 | 0 | 3 |
| Qwen3 | 7 | 7 | 0 | 3 |
| Qwen3 | 7 | 7 | 0 | 3 |
| Qwen3 | 4 | 9 | 0 | 3 |
| Qwen3 | 1 | 10 | 0 | 3 |
| Qwen3 | 1 | 8 | 0 | 3 |
| Huihui-Qwen3.6-35B-A3B-Claude-4.7-Opus-abliterated-ggml-model-Q6_K | 2 | 5 | 0 | 0 |

## Per-Task Results

### Qwen3.6-27B-UD-Q5_K_XL (22/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | PASS | 1/1 | 66.10220379160884 | - | 62241ms |
| task02 | Format player name for display | PASS | 1/1 | 66.19386891662677 | - | 28412ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 66.21473140525558 | - | 23526ms |
| task04 | Validate ladder name | PASS | 1/1 | 66.04128709201007 | - | 56142ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 66.1121526039261 | - | 23498ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 66.26645564420693 | - | 25808ms |
| task07 | Format game result for display | PASS | 2/2 | 66.1029647403916 | - | 44998ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 66.04551535683714 | - | 48233ms |
| task09 | Create debounce utility | PASS | 2/2 | 66.09096671346323 | - | 22676ms |
| task10 | Deep clone with circular reference handling | TEST_FAIL | 0/2 | 66.05834294370943 | - | 41129ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 66.17689207527575 | - | 19588ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 65.90301759555865 | - | 62405ms |
| task13 | Batch cell correction state management | PASS | 3/3 | 66.20525588912635 | - | 18390ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 65.94470948264315 | - | 62534ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 66.3597779940133 | - | 18770ms |

### gemma-4-26B-A4B-it-UD-Q6_K (21/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | TSC_FAIL | 0/1 | 193.68214150409693 | - | 21344ms |
| task02 | Format player name for display | PASS | 1/1 | 195.1064506231174 | - | 18477ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 202.77545331737784 | - | 3134ms |
| task04 | Validate ladder name | PASS | 1/1 | 195.10418409898537 | - | 17052ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 199.22824635204654 | - | 5347ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 199.96000799840033 | - | 3870ms |
| task07 | Format game result for display | PASS | 2/2 | 199.04117840248742 | - | 10290ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 197.55896176561694 | - | 13675ms |
| task09 | Create debounce utility | PASS | 2/2 | 200.75642151678647 | - | 4171ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 196.4269905113234 | - | 15922ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 199.17091046176546 | - | 6820ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 193.31716347274084 | - | 21350ms |
| task13 | Batch cell correction state management | PASS | 3/3 | 198.15340984629367 | - | 12697ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 193.11599925507014 | - | 21453ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 200.78568310781318 | - | 5732ms |

### Qwen3 (19/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | PASS | 1/1 | 127.81149660670631 | 2250/2672 | 28438ms |
| task02 | Format player name for display | PASS | 1/1 | 125.4620815921144 | 1309/1610 | 17170ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 132.84960118566582 | 1008/1134 | 12220ms |
| task04 | Validate ladder name | PASS | 1/1 | 125.70659849257524 | 1420/1738 | 18459ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 126.90883538495817 | 968/1172 | 12624ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 131.10903844166998 | 1403/1602 | 17219ms |
| task07 | Format game result for display | PASS | 2/2 | 129.56329669659868 | 1544/1784 | 19084ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 130.9938839521288 | 2273/2584 | 27511ms |
| task09 | Create debounce utility | PASS | 2/2 | 129.444552797936 | 1177/1366 | 14667ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 127.55454287981253 | 1938/2302 | 24477ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 128.5973674007593 | 926/1094 | 11729ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 122.3242065120498 | 2508/3173 | 33746ms |
| task13 | Batch cell correction state management | TEST_FAIL | 0/3 | 130.50101697791376 | 1667/1912 | 20416ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 120.94485570091707 | 2498/3192 | 34136ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 130.95896201273496 | 799/886 | 9797ms |

### Qwen3 (17/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | PASS | 1/1 | 140.17142553331655 | 2359/3368 | 23189ms |
| task02 | Format player name for display | PASS | 1/1 | 133.5968363570605 | 2215/3376 | 23212ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 152.36559601802833 | 1225/1564 | 10897ms |
| task04 | Validate ladder name | PASS | 1/1 | 129.75051714317866 | 2251/3572 | 24461ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 139.504986069687 | 1143/1644 | 11429ms |
| task06 | Calculate ELO rating delta | TSC_FAIL | 0/2 | 153.61126151474716 | 1317/1656 | 11543ms |
| task07 | Format game result for display | PASS | 2/2 | 142.31321556015214 | 1592/2224 | 15362ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 146.57804633464198 | 2903/3872 | 26693ms |
| task09 | Create debounce utility | PASS | 2/2 | 143.79568185360566 | 1552/2136 | 14798ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 138.27846368817174 | 2429/3508 | 24148ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 145.58343589236335 | 1111/1508 | 10495ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 127.81301754364725 | 2918/4707 | 32308ms |
| task13 | Batch cell correction state management | TEST_FAIL | 0/3 | 155.48680814464277 | 1607/1988 | 13833ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 133.60661365785126 | 2972/4492 | 31067ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 147.5015116530265 | 819/1068 | 7666ms |

### Qwen3 (17/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | PASS | 1/1 | 134.49156263362352 | 2024/2640 | 21977ms |
| task02 | Format player name for display | PASS | 1/1 | 132.92883007088798 | 1661/2199 | 18320ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 141.87436828306053 | 1060/1269 | 10706ms |
| task04 | Validate ladder name | PASS | 1/1 | 130.7133860860105 | 2284/3069 | 25554ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 133.00848348160753 | 1183/1551 | 13050ms |
| task06 | Calculate ELO rating delta | TSC_FAIL | 0/2 | 143.16663265219248 | 1246/1464 | 12366ms |
| task07 | Format game result for display | PASS | 2/2 | 137.25419666538562 | 1840/2307 | 19270ms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 137.0300787198688 | 2587/3228 | 27013ms |
| task09 | Create debounce utility | PASS | 2/2 | 135.0497028301273 | 1250/1605 | 13510ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 127.39108199058289 | 2386/3333 | 27711ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 134.33024875222952 | 1330/1686 | 14425ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 127.5222339653789 | 2819/3826 | 32423ms |
| task13 | Batch cell correction state management | TEST_FAIL | 0/3 | 138.99680160425228 | 1353/1614 | 13992ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 125.232330279236 | 2795/3899 | 32989ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 134.34169300339244 | 882/1110 | 9723ms |

### Qwen3 (16/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | TEST_FAIL | 0/1 | 272.39639277627947 | 93/98 | 840ms |
| task02 | Format player name for display | PASS | 1/1 | 264.3505927949806 | 1234/1538 | 7704ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 279.1369139915213 | 1067/1218 | 6157ms |
| task04 | Validate ladder name | PASS | 1/1 | 263.95344182820486 | 1978/2478 | 12340ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 274.2368492681408 | 1348/1590 | 7971ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 252.26430572191504 | 89/92 | 686ms |
| task07 | Format game result for display | ERROR | 0/2 | - | - | undefinedms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 271.9628276816693 | 2257/2624 | 13258ms |
| task09 | Create debounce utility | PASS | 2/2 | 270.2015744377121 | 755/886 | 4589ms |
| task10 | Deep clone with circular reference handling | TSC_FAIL | 0/2 | 270.40805465490905 | 1855/2186 | 11041ms |
| task11 | Resolve merge conflict with priority | PASS | 3/3 | 268.9743579816409 | 825/990 | 5050ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 255.2789327445963 | 2473/3242 | 16186ms |
| task13 | Batch cell correction state management | TEST_FAIL | 0/3 | 275.1095931115763 | 1309/1504 | 7646ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 253.2413783552319 | 2452/3286 | 16323ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 272.32252153085744 | 449/526 | 2767ms |

### Qwen3 (14/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | TEST_FAIL | 0/1 | 285.3498052907211 | 112/126 | 843ms |
| task02 | Format player name for display | PASS | 1/1 | 272.5539786241568 | 1388/1812 | 7444ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 273.56786354712955 | 1209/1572 | 6486ms |
| task04 | Validate ladder name | PASS | 1/1 | 272.7126135241693 | 2012/2640 | 10753ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 274.6228527539374 | 1084/1416 | 5819ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 285.8758282458024 | 101/105 | 618ms |
| task07 | Format game result for display | ERROR | 0/2 | - | - | undefinedms |
| task08 | Calculate player stats from game results | TSC_FAIL | 0/2 | 264.20876827368727 | 2807/3861 | 15640ms |
| task09 | Create debounce utility | PASS | 2/2 | 271.5528173122636 | 980/1290 | 5351ms |
| task10 | Deep clone with circular reference handling | TEST_FAIL | 0/2 | 260.8752140901374 | 2097/2856 | 11828ms |
| task11 | Resolve merge conflict with priority | TSC_FAIL | 0/3 | 264.52778045434195 | 2844/3753 | 15652ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 260.43151900434793 | 2782/3934 | 15887ms |
| task13 | Batch cell correction state management | PASS | 3/3 | 289.4851563127651 | 1573/1875 | 7751ms |
| task14 | Rate-limited API request queue | TSC_FAIL | 0/3 | 269.38122619361496 | 2831/3792 | 15359ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 289.44857387700034 | 816/987 | 4104ms |

### Qwen3 (12/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | TEST_FAIL | 0/1 | 281.6980197228571 | 105/140 | 821ms |
| task02 | Format player name for display | TSC_FAIL | 0/1 | 278.24092770524936 | 2973/4486 | 14850ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 288.98293846541685 | 941/1340 | 4583ms |
| task04 | Validate ladder name | PASS | 1/1 | 266.90905663057333 | 1785/2876 | 9523ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 284.24270877782186 | 1209/1764 | 5952ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 288.88128049302406 | 105/128 | 615ms |
| task07 | Format game result for display | ERROR | 0/2 | - | - | undefinedms |
| task08 | Calculate player stats from game results | PASS | 2/2 | 287.9917798689757 | 2399/3408 | 11420ms |
| task09 | Create debounce utility | PASS | 2/2 | 285.5851938995593 | 1184/1704 | 5791ms |
| task10 | Deep clone with circular reference handling | TEST_FAIL | 0/2 | 299.1659358646854 | 2465/3364 | 11198ms |
| task11 | Resolve merge conflict with priority | TSC_FAIL | 0/3 | 290.14963248893844 | 3037/4230 | 14265ms |
| task12 | Parse ELO rating changes from game results | TSC_FAIL | 0/3 | 252.01116724484854 | 2850/4979 | 16408ms |
| task13 | Batch cell correction state management | TEST_FAIL | 0/3 | 290.9169538347974 | 1735/2428 | 8205ms |
| task14 | Rate-limited API request queue | TEST_FAIL | 0/3 | 276.76259434251705 | 2044/3096 | 10337ms |
| task15 | Express middleware for API key auth | PASS | 3/3 | 290.3289383916434 | 850/1192 | 4107ms |

### Huihui-Qwen3.6-35B-A3B-Claude-4.7-Opus-abliterated-ggml-model-Q6_K (7/30)

| Task | Title | Status | Score | Gen TPS | Draft | Time |
|------|-------|--------|-------|---------|-------|------|
| task01 | Parse game result string | PASS | 1/1 | 9.6782375373224 | - | 21747ms |
| task02 | Format player name for display | PASS | 1/1 | 9.746098015230665 | - | 17556ms |
| task03 | Calculate win rate from wins and total games | PASS | 1/1 | 9.754230844616728 | - | 16684ms |
| task04 | Validate ladder name | PASS | 1/1 | 9.731085548175352 | - | 21827ms |
| task05 | Parse ISO date string to timestamp | PASS | 1/1 | 9.760218189316134 | - | 16320ms |
| task06 | Calculate ELO rating delta | PASS | 2/2 | 9.690386588441418 | - | 28814ms |
| task07 | Format game result for display | ERROR | 0/2 | - | - | undefinedms |

