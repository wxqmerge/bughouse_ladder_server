$content = Get-Content "dataService.ts" -Raw
$oldPattern = "localStorage.setItem('ladder_players',"
$newPattern = 'localStorage.setItem(getKeyPrefix() + "'"'"ladder_players"'"'"'"'",' 
$content = $content -replace [regex]::Escape($oldPattern), $newPattern
Set-Content "dataService.ts" $content
