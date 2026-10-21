param(
    [string]$ProjectRoot,
    [string[]]$Keys = @('ADMIN_API_KEY', 'USER_API_KEY'),
    [string[]]$EnvFiles = @('.env', 'server\.env'),
    [hashtable]$Values
)

$ErrorActionPreference = 'Stop'

function Get-PlainSecureString {
    param([securestring]$SecureString)
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

$root = if ($ProjectRoot) { $ProjectRoot } else { Split-Path -Parent $PSScriptRoot }
$files = $EnvFiles | ForEach-Object { [IO.Path]::GetFullPath([IO.Path]::Combine($root, $_)) }

foreach ($keyName in $Keys) {
    $value = if ($Values -and $Values.ContainsKey($keyName)) { $Values[$keyName] } else { '' }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $envName = "${keyName}_NEW"
        $value = [Environment]::GetEnvironmentVariable($envName)
    }
    if ([string]::IsNullOrWhiteSpace($value)) {
        $secure = Read-Host -Prompt "$keyName (Enter to skip)" -AsSecureString
        $value = Get-PlainSecureString -SecureString $secure
    }

    $value = $value.Trim()
    if ([string]::IsNullOrWhiteSpace($value)) {
        Write-Host "Skipped: $keyName"
        continue
    }

    $pattern = "(?m)^$([regex]::Escape($keyName))=[^\r\n]*(?=\r?$)"
    $replacement = $keyName + '=' + $value.Replace('$', '$$')

    foreach ($file in $files) {
        if (-not (Test-Path -LiteralPath $file)) {
            Write-Host "Skipped: $file (not found)"
            continue
        }

        $content = [IO.File]::ReadAllText($file)
        $updated = [regex]::Replace($content, $pattern, $replacement)

        if ($updated -eq $content) {
            $separator = if ($content.EndsWith("`n") -or [string]::IsNullOrWhiteSpace($content)) { '' } else { "`r`n" }
            $updated = $content + $separator + $keyName + '=' + $value + "`r`n"
            Write-Host "Added: $file"
        } else {
            Write-Host "Updated: $file"
        }

        [IO.File]::WriteAllText($file, $updated)
    }
}
