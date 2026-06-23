<#
.SYNOPSIS
  Verify the Bughouse Chess Ladder server setup.
.DESCRIPTION
  Two modes:
    Local:  checks dev environment (Node, git, .env, build artifacts).
    Remote: checks a deployed server via its API endpoints.
.PARAMETER ClientConfigUrl
  Client config URL containing ?server= and ?key= query params.
  Example: https://example.com/dev-ladder/dist/?config=1&server=https://dev-ladder.example.com&key=ABC123
.PARAMETER Fast
  Skip slow checks (typecheck, port scan). Local mode only.
.PARAMETER SkipSsl
  Skip SSL certificate validation. Use for dev/staging with self-signed or mismatched certs.
.EXAMPLES
  .\deploy\verify.ps1                          # local dev checks
  .\deploy\verify.ps1 -Fast                    # local, skip slow
  .\deploy\verify.ps1 "https://example.com/dev-ladder/dist/?config=1&server=https://dev-ladder.example.com&key=..."
  .\deploy\verify.ps1 "https://..." -SkipSsl   # remote, skip SSL validation
#>
param(
    [string]$ClientConfigUrl,
    [switch]$Fast,
    [switch]$SkipSsl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$Script:PassCount = 0
$Script:FailCount = 0
$Script:WarnCount = 0

function Pass { param([string]$d) Write-Host "  [PASS] $d" -ForegroundColor Green;  $Script:PassCount++ }
function Fail { param([string]$d) Write-Host "  [FAIL] $d" -ForegroundColor Red;   $Script:FailCount++ }
function Warn { param([string]$d) Write-Host "  [WARN] $d" -ForegroundColor Yellow; $Script:WarnCount++ }
function Info { param([string]$d) Write-Host "  [INFO] $d" -ForegroundColor Gray }

# ---- Helpers ----
function Parse-QueryParams {
    param([string]$Url)
    $queryString = [System.Web.HttpUtility]::ParseQueryString(
        (New-Object System.Uri($Url)).Query
    )
    $result = @{}
    foreach ($key in $queryString.AllKeys) {
        if ($key) { $result[$key] = $queryString[$key] }
    }
    $result
}

function Invoke-Api {
    param(
        [string]$BaseUrl,
        [string]$Path,
        [string]$Method = 'GET',
        [string]$ApiKey,
        [int]$TimeoutSec = 10
    )
    $uri = "$BaseUrl$Path"
    $headers = @{}
    if ($ApiKey) { $headers['X-API-Key'] = $ApiKey }
    $headers['Accept'] = 'application/json'

    $params = @{
        Uri = $uri
        Method = $Method
        Headers = $headers
        TimeoutSec = $TimeoutSec
        UseBasicParsing = $true
        ErrorAction = 'Stop'
    }
    if ($Script:SkipSsl) { $params['SkipCertificateCheck'] = $true }

    try {
        $resp = Invoke-WebRequest @params
        @{
            Success = $true
            StatusCode = $resp.StatusCode
            Content = $resp.Content
            Headers = $resp.Headers
            Error = $null
        }
    } catch {
        $status = 0
        if ($_.Exception.Message -match '\b(\d{3})\b') {
            $status = [int]$Matches[1]
        }
        @{
            Success = $false
            StatusCode = $status
            Content = $null
            Headers = @{}
            Error = $_.Exception.Message
        }
    }
}

function Invoke-TimedApi {
    param(
        [string]$BaseUrl,
        [string]$Path,
        [string]$Method = 'GET',
        [string]$ApiKey,
        [int]$TimeoutSec = 10
    )
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $result = Invoke-Api -BaseUrl $BaseUrl -Path $Path -Method $Method -ApiKey $ApiKey -TimeoutSec $TimeoutSec
    $sw.Stop()
    if ($result) {
        $result['DurationMs'] = $sw.ElapsedMilliseconds
    } else {
        $result = @{
            Success = $false
            StatusCode = 0
            Content = $null
            Headers = @{}
            Error = 'Invoke-Api returned null'
            DurationMs = $sw.ElapsedMilliseconds
        }
    }
    $result
}

# ---- Mode detection ----
$IsRemote = [bool]$ClientConfigUrl

if ($IsRemote) {
    # Parse client config URL
    $params = Parse-QueryParams -Url $ClientConfigUrl
    $ServerUrl = $params['server']
    $ApiKey = $params['key']

    if (-not $ServerUrl) {
        Write-Host ''
        Write-Host '[ERROR] No "server" query param in URL.' -ForegroundColor Red
        Write-Host 'Expected format: ...?config=1&server=https://YOUR_SERVER&key=YOUR_KEY' -ForegroundColor Yellow
        exit 1
    }
    if (-not $ApiKey) {
        Write-Host ''
        Write-Host '[ERROR] No "key" query param in URL.' -ForegroundColor Red
        exit 1
    }

    # Strip trailing slash
    $ServerUrl = $ServerUrl.TrimEnd('/')

    # Parse server URL once for reuse
    $Script:UriParts = [System.Uri]$ServerUrl

    # Project root (for local version comparison)
    $Root = $PSScriptRoot | Split-Path -Parent

    function Get-PackageVersion {
        param([string]$JsonPath)
        if (Test-Path -LiteralPath $JsonPath) {
            (Get-Content -Raw -LiteralPath $JsonPath | ConvertFrom-Json).version
        }
    }

    # Skip SSL validation if requested
    if ($SkipSsl) {
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
        Warn 'SSL certificate validation is DISABLED (-SkipSsl)'
    }

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host '  Bughouse Chess Ladder - Remote Verify' -ForegroundColor Cyan
    Write-Host "  Server: $ServerUrl" -ForegroundColor Cyan
    Write-Host "  Key:    $($ApiKey.Substring(0, [Math]::Min(8, $ApiKey.Length)))*" -ForegroundColor Cyan
    Write-Host "  SkipSsl: $($SkipSsl.ToString().ToUpper())" -ForegroundColor Cyan
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host ''

    # ---- 1. Connectivity ----
    Write-Host '1. Connectivity'
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $port = if ($Script:UriParts.Port -eq -1) { if ($Script:UriParts.Scheme -eq 'https') { 443 } else { 80 } } else { $Script:UriParts.Port }
        $task = $tcp.ConnectAsync($Script:UriParts.Host, $port)
        if ($task.Wait(5000)) {
            if ($tcp.Connected) {
                Pass "TCP connection to $($Script:UriParts.Host):$port"
                $tcp.Close()
            } else {
                Fail "TCP connection to $($Script:UriParts.Host):$port refused"
                Info '[FIX] Server not reachable. Check firewall rules and nginx is running.'
                Info '[FIX] On server: sudo systemctl status nginx'
            }
        } else {
            Fail "TCP connection to $($Script:UriParts.Host):$port timed out"
            Info '[FIX] Connection timed out — check DNS, firewall, and server is online.'
            Info '[FIX] Test DNS: nslookup $($Script:UriParts.Host)'
        }
    } catch {
        Fail "TCP connection failed: $_"
    }
    Write-Host ''

    # ---- 2. SSL certificate ----
    Write-Host '2. SSL certificate'
    if ($Script:UriParts.Scheme -eq 'https') {
        try {
            # Use openssl if available, otherwise skip detailed cert check
            if (Get-Command openssl -ErrorAction SilentlyContinue) {
                $certOut = openssl s_client -connect "${uriParts.Host}:$port" -servername $Script:UriParts.Host 2>&1 | Out-String
                if ($certOut -match 'subject\s*=\s*(.*)') {
                    Info "Subject: $($Matches[1].Trim())"
                }
                if ($certOut -match 'issuer\s*=\s*(.*)') {
                    Info "Issuer: $($Matches[1].Trim())"
                }
                if ($certOut -match 'notAfter\s*=\s*(.*)') {
                    Info "Expires: $($Matches[1].Trim())"
                }
                if ($certOut -match 'Verify return code: 0') {
                    Pass 'SSL certificate is valid'
                } elseif ($certOut -match 'CONNECTED') {
                    Warn 'SSL connection OK but verify returned non-zero (self-signed?)'
                } else {
                    Fail 'SSL certificate verification failed'
                }
            } else {
                # Fallback: just test HTTPS connectivity
                $fbParams = @{
                    Uri = $ServerUrl
                    TimeoutSec = 5
                    UseBasicParsing = $true
                    ErrorAction = 'Stop'
                }
                if ($Script:SkipSsl) { $fbParams['SkipCertificateCheck'] = $true }
                try {
                    $null = Invoke-WebRequest @fbParams
                    Pass 'HTTPS connection works'
                } catch {
                    Fail "HTTPS connection failed: $_"
                }
            }
        } catch {
            Warn "SSL check error: $_"
        }
    } else {
        Warn 'Server uses HTTP (no SSL)'
    }
    Write-Host ''

    # ---- 3. Root URL diagnostic ----
    Write-Host '3. Root URL diagnostic'
    $rootCheck = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/'
    if ($rootCheck['Success']) {
        $rootContent = $rootCheck['Content']
        if ($rootContent -match 'BUGHOUSE') {
            Pass "Root serves frontend ($($rootCheck['DurationMs'])ms)"
        } elseif ($rootContent -match '<html|<!DOCTYPE') {
            if ($rootContent -match 'nginx') {
                Fail "Root serves nginx default page — proxy_pass not configured"
                Info '[FIX] Check nginx config: cat /etc/nginx/sites-available/*'
                Info '[FIX] Enable config: sudo ln -s /etc/nginx/sites-available/YOUR_CONF /etc/nginx/sites-enabled/'
                Info '[FIX] Reload: sudo systemctl reload nginx'
            } else {
                Pass "Root serves HTML ($($rootCheck['DurationMs'])ms)"
            }
        } else {
            Pass "Root responds ($($rootCheck['DurationMs'])ms)"
        }
    } else {
        Fail "Root URL returned HTTP $($rootCheck['StatusCode'])"
        if ($rootCheck['Error']) { Info "Error: $($rootCheck['Error'])" }
        if ($rootCheck['StatusCode'] -eq 0) {
            Info '[FIX] Connection refused — check nginx is enabled: ls -la /etc/nginx/sites-enabled/'
            Info '[FIX] Enable config: sudo ln -s /etc/nginx/sites-available/YOUR_CONF /etc/nginx/sites-enabled/'
        }
    }
    Write-Host ''

    # ---- 4. Health endpoint ----
    Write-Host '4. Health endpoint'
    $health = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/health'
    if ($health.Success -and $health.StatusCode -eq 200) {
        $body = $health.Content | ConvertFrom-Json
        Pass "GET /health ($($health.DurationMs)ms)"
        Info "Status: $($body.status)"
        Info "Version: $($body.version)"
        if ($body.writeHealth) {
            $wh = $body.writeHealth
            Info "Last write success: $($wh.lastWriteSuccess)"
            if ($wh.lastError) {
                Warn "Last error: $($wh.lastError)"
            }
            if ($wh.consecutiveFailures -gt 0) {
                Warn "Consecutive write failures: $($wh.consecutiveFailures)"
            }
        }
    } else {
        Fail "GET /health failed (HTTP $($health.StatusCode))"
        if ($health.Error) { Info "Error: $($health.Error)" }
        if ($health.StatusCode -eq 0) {
            Info '[FIX] Connection refused — nginx config may not be enabled'
            Info '[FIX] Check: ls -la /etc/nginx/sites-enabled/'
            Info '[FIX] Enable: sudo ln -s /etc/nginx/sites-available/YOUR_CONF /etc/nginx/sites-enabled/'
            Info '[FIX] Reload: sudo systemctl reload nginx'
        } elseif ($health.StatusCode -eq 404) {
            Info '[FIX] nginx returns 404 — proxy_pass likely misconfigured or missing'
            Info '[FIX] Check config: cat /etc/nginx/sites-available/*'
        }
    }
    Write-Host ''

    # ---- 4. CORS headers ----
    Write-Host '5. CORS headers'
    $corsResp = Invoke-Api -BaseUrl $ServerUrl -Path '/health' -Method 'OPTIONS'
    if ($corsResp.Success) {
        $accessOrigin = $corsResp.Headers['Access-Control-Allow-Origin']
        if ($accessOrigin) {
            Pass "CORS Allow-Origin: $accessOrigin"
        } else {
            Warn 'No Access-Control-Allow-Origin header'
        }
        $accessMethods = $corsResp.Headers['Access-Control-Allow-Methods']
        if ($accessMethods) {
            Info "Allow-Methods: $accessMethods"
        }
    } else {
        Warn "OPTIONS /health failed (HTTP $($corsResp.StatusCode))"
    }
    Write-Host ''

    # ---- 5. Ladder data ----
    Write-Host '6. Ladder data'
    $ladder = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/api/ladder' -ApiKey $ApiKey
    if ($ladder.Success -and $ladder.StatusCode -eq 200) {
        $data = $ladder.Content | ConvertFrom-Json
        if ($data.success) {
            $count = if ($data.data -is [System.Array]) { $data.data.Count } else { 0 }
            Pass "GET /api/ladder — $count entries ($($ladder.DurationMs)ms)"
        } else {
            Fail "GET /api/ladder returned error in response body"
        }
    } elseif ($ladder.StatusCode -eq 401 -or $ladder.StatusCode -eq 403) {
        Fail "GET /api/ladder — auth failed (HTTP $($ladder.StatusCode)). Key may be invalid."
    } elseif ($ladder.StatusCode -eq 404) {
        Fail "GET /api/ladder — 404 (nginx proxy_pass not routing to backend)"
        Info '[FIX] Check proxy_pass in nginx config routes /api to backend port'
        Info '[FIX] Verify backend is running: ss -tlnp | grep PORT'
    } elseif ($ladder.StatusCode -eq 0) {
        Fail "GET /api/ladder — connection refused"
        Info '[FIX] Backend not reachable through nginx. Check sites-enabled symlink.'
    } else {
        Fail "GET /api/ladder failed (HTTP $($ladder.StatusCode))"
    }
    Write-Host ''

    # ---- 6. Games endpoint ----
    Write-Host '7. Games endpoint'
    $games = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/api/games' -ApiKey $ApiKey
    if ($games.Success -and $games.StatusCode -eq 200) {
        $data = $games.Content | ConvertFrom-Json
        $count = if ($data -is [System.Array]) { $data.Count } elseif ($data.success -and $data.data) { $data.data.Count } else { 0 }
        Pass "GET /api/games — $count entries ($($games.DurationMs)ms)"
    } elseif ($games.StatusCode -eq 401 -or $games.StatusCode -eq 403) {
        Fail "GET /api/games — auth failed (HTTP $($games.StatusCode))"
    } elseif ($games.StatusCode -eq 404) {
        Fail "GET /api/games — 404 (nginx proxy_pass not routing to backend)"
        Info '[FIX] Check proxy_pass in nginx config routes /api to backend port'
    } elseif ($games.StatusCode -eq 0) {
        Fail "GET /api/games — connection refused"
        Info '[FIX] Backend not reachable through nginx. Check sites-enabled symlink.'
    } else {
        Fail "GET /api/games failed (HTTP $($games.StatusCode))"
    }
    Write-Host ''

    # ---- 7. Admin endpoint ----
    Write-Host '8. Admin endpoint'
    $admin = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/api/admin/status' -ApiKey $ApiKey
    if ($admin.Success -and $admin.StatusCode -eq 200) {
        Pass "GET /api/admin/status ($($admin.DurationMs)ms)"
    } elseif ($admin.StatusCode -eq 403) {
        Warn 'Admin endpoint rejected key — this may be a user-only key'
    } elseif ($admin.StatusCode -eq 404) {
        Warn '/api/admin/status returned 404 — may not exist, or nginx not proxying'
        Info '[FIX] If all /api/* endpoints 404, check nginx proxy_pass configuration'
    } elseif ($admin.StatusCode -eq 0) {
        Fail "GET /api/admin/status — connection refused"
        Info '[FIX] Backend not reachable. Check sites-enabled symlink and backend port.'
    } else {
        Fail "GET /api/admin/status failed (HTTP $($admin.StatusCode))"
    }
    Write-Host ''

    # ---- 8. SSE endpoint ----
    Write-Host '9. SSE endpoint'
    $sseUrl = "$ServerUrl/api/ladder/events"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $sseHeaders = @{}
        if ($ApiKey) { $sseHeaders['X-API-Key'] = $ApiKey }
        $sseParams = @{
            Uri = $sseUrl
            Headers = $sseHeaders
            TimeoutSec = 5
            UseBasicParsing = $true
            ErrorAction = 'Stop'
        }
        if ($Script:SkipSsl) { $sseParams['SkipCertificateCheck'] = $true }
        # SSE holds the connection open — a timeout means it's working
        $resp = Invoke-WebRequest @sseParams
        $sw.Stop()
        # If we got here without timeout, the connection closed immediately
        $ct = $resp.Headers['Content-Type']
        if ($ct -and $ct -match 'text/event-stream') {
            Info "Content-Type: $ct"
        }
        if ($resp.Content -match 'event:') {
            Pass "SSE connected and returned events ($($sw.ElapsedMilliseconds)ms)"
        } else {
            Warn "SSE connected but no events in response ($($sw.ElapsedMilliseconds)ms)"
        }
    } catch {
        $sw.Stop()
        if ($sw.ElapsedMilliseconds -ge 4500) {
            # Timeout is expected — SSE holds the connection open
            Pass "SSE connection held open ($($sw.ElapsedMilliseconds)ms — expected behavior)"
        } else {
            Fail "SSE connection failed: $_"
        }
    }
    Write-Host ''

    # ---- 9a. Nginx proxy diagnostics ----
    Write-Host '10. Nginx proxy diagnostics'
    $apiStatuses = @{
        '/health' = $health.StatusCode
        '/api/ladder' = $ladder.StatusCode
        '/api/games' = $games.StatusCode
        '/api/admin/status' = $admin.StatusCode
    }
    $apiFails = ($apiStatuses.GetEnumerator() | Where-Object { $_.Value -ne 200 })
    if ($apiFails.Count -eq $apiStatuses.Count) {
        $commonStatus = $apiFails[0].Value
        $allSame = ($apiFails | Where-Object { $_.Value -eq $commonStatus }).Count -eq $apiFails.Count
        if ($allSame) {
            Fail "All endpoints return HTTP $commonStatus — nginx proxy is not working"
            if ($commonStatus -eq 0) {
                Info '[FIX] Connection refused — nginx config likely not enabled'
                Info '[FIX]   ls -la /etc/nginx/sites-enabled/'
                Info '[FIX]   sudo ln -s /etc/nginx/sites-available/YOUR_CONF /etc/nginx/sites-enabled/'
                Info '[FIX]   sudo systemctl reload nginx'
            } elseif ($commonStatus -eq 404) {
                Info '[FIX] 404 — nginx is running but proxy_pass not configured'
                Info '[FIX]   cat /etc/nginx/sites-available/YOUR_CONF'
                Info '[FIX]   Ensure config has: location /api { proxy_pass http://127.0.0.1:PORT; }'
            }
        }
    } elseif ($apiFails.Count -gt 0) {
        Warn "$($apiFails.Count)/$($apiStatuses.Count) endpoints failing — partial proxy misconfiguration"
    } else {
        Pass "All API endpoints respond with HTTP 200"
    }
    Write-Host ''

    # ---- 11. Response time summary ----
    Write-Host '11. Response time summary'
    $endpointMap = @{ rootCheck='/'; health='/health'; ladder='/api/ladder'; games='/api/games'; admin='/api/admin/status' }
    foreach ($name in $endpointMap.Keys) {
        $var = Get-Variable -Name $name -ErrorAction SilentlyContinue
        if ($var -and $var.Value -is [hashtable] -and $var.Value.ContainsKey('DurationMs')) {
            $ms = $var.Value['DurationMs']
            $path = $endpointMap[$name]
            if ($ms -lt 100) {
                Info "  ${path}`: ${ms}ms"
            } elseif ($ms -lt 500) {
                Info "  ${path}`: ${ms}ms"
            } else {
                Warn "  ${path}`: ${ms}ms (slow)"
            }
        }
    }
    Write-Host ''

    # ---- 12. Print layouts ----
    Write-Host '12. Print layouts'
    $print = Invoke-TimedApi -BaseUrl $ServerUrl -Path '/api/print-layouts' -ApiKey $ApiKey
    if ($print.Success -and $print.StatusCode -eq 200) {
        Pass "GET /api/print-layouts ($($print.DurationMs)ms)"
    } elseif ($print.StatusCode -eq 404) {
        Info '/api/print-layouts not available'
    } else {
        Fail "GET /api/print-layouts failed (HTTP $($print.StatusCode))"
    }
    Write-Host ''

    # ---- 13. DNS resolution ----
    Write-Host '13. DNS resolution'
    try {
        $dnsResult = Resolve-DnsName -Name $Script:UriParts.Host -Type A -ErrorAction Stop | Select-Object -First 1
        if ($dnsResult) {
            Pass "$($Script:UriParts.Host) -> $($dnsResult.IPAddress)"
        } else {
            Fail "DNS resolution failed for $($Script:UriParts.Host)"
        }
    } catch {
        # Fallback: try ping
        try {
            $ping = Test-Connection -ComputerName $Script:UriParts.Host -Count 1 -ErrorAction Stop
            Pass "$($Script:UriParts.Host) -> $($ping.IPV4Address)"
        } catch {
            Fail "Cannot resolve $($Script:UriParts.Host): $_"
        }
    }
    Write-Host ''

    # ---- 14. Deployed version vs local codebase ----
    Write-Host '14. Deployed version'
    $localVer = Get-PackageVersion (Join-Path $Root 'package.json')
    if ($localVer) {
        Info "Local codebase version: $localVer"
    }
    if ($health['Success'] -and $health['StatusCode'] -eq 200) {
        $healthBody = $health['Content'] | ConvertFrom-Json
        $deployedVer = $healthBody.version
        if ($deployedVer) {
            Info "Deployed version: $deployedVer"
            if ($localVer) {
                if ($deployedVer -eq $localVer) {
                    Pass "Deployed version matches local codebase"
                } else {
                    Warn "Deployed $deployedVer != Local $localVer (may need to deploy)"
                }
            }
        }
    } else {
        Info 'Could not determine deployed version (health endpoint unavailable)'
    }
    Write-Host ''

    # ---- 15. Security headers ----
    Write-Host '15. Security headers'
    $secResp = Invoke-Api -BaseUrl $ServerUrl -Path '/health'
    $secHeaders = $secResp['Headers']
    $secChecks = @{
        'X-Content-Type-Options' = 'nosniff'
        'X-Frame-Options' = $null       # any value is OK
        'X-XSS-Protection' = $null
        'Strict-Transport-Security' = $null
    }
    foreach ($hdr in $secChecks.Keys) {
        $expected = $secChecks[$hdr]
        $actual = $secHeaders[$hdr]
        if ($actual) {
            if ($expected -and $actual -notmatch $expected) {
                Warn "$hdr present but unexpected value: $actual"
            } else {
                Pass "$hdr present"
            }
        } else {
            Warn "$hdr missing"
        }
    }
    Write-Host ''

    # ---- 16. Rate limiting headers ----
    Write-Host '16. Rate limiting'
    $rlResp = Invoke-Api -BaseUrl $ServerUrl -Path '/api/ladder' -ApiKey $ApiKey
    $rlHeaders = $rlResp['Headers']
    if ($rlHeaders['X-RateLimit-Limit'] -or $rlHeaders['X-RateLimit-Remaining']) {
        Pass 'Rate limit headers present'
        $rlLimit = if ($rlHeaders['X-RateLimit-Limit']) { $rlHeaders['X-RateLimit-Limit'] } else { 'N/A' }
        $rlRemain = if ($rlHeaders['X-RateLimit-Remaining']) { $rlHeaders['X-RateLimit-Remaining'] } else { 'N/A' }
        Info "Limit: $rlLimit"
        Info "Remaining: $rlRemain"
    } else {
        # express-rate-limit uses standard headers by default
        if ($rlHeaders['RateLimit-Policy'] -or $rlHeaders['RateLimit-Limit']) {
            Pass 'Rate limit headers present (standard)'
        } else {
            Info 'No rate limit headers in response (may still be enforced server-side)'
        }
    }
    Write-Host ''

    # ---- 17. API key type detection ----
    Write-Host '17. API key type'
    $adminTest = Invoke-Api -BaseUrl $ServerUrl -Path '/api/admin/backups' -ApiKey $ApiKey
    if ($adminTest['Success'] -and $adminTest['StatusCode'] -eq 200) {
        Pass 'Key has admin access'
    } elseif ($adminTest['StatusCode'] -eq 403) {
        Info 'Key is user-level (no admin access)'
    } elseif ($adminTest['StatusCode'] -eq 404) {
        Info 'Admin backups endpoint not found (key may be admin or user)'
    } else {
        Info "Admin test returned HTTP $($adminTest['StatusCode'])"
    }
    Write-Host ''

    # ---- 18. CORS actual headers on API response ----
    Write-Host '18. CORS headers (API response)'
    $corsTest = Invoke-Api -BaseUrl $ServerUrl -Path '/api/ladder' -ApiKey $ApiKey
    $corsHdrs = $corsTest['Headers']
    $allowOrigin = $corsHdrs['Access-Control-Allow-Origin']
    if ($allowOrigin) {
        Pass "Access-Control-Allow-Origin: $allowOrigin"
        if ($allowOrigin -eq '*') {
            Warn 'CORS is wildcard — works but less secure'
        }
    } else {
        Warn 'No Access-Control-Allow-Origin header on API response'
    }
    $allowCreds = $corsHdrs['Access-Control-Allow-Credentials']
    if ($allowCreds) {
        Info "Access-Control-Allow-Credentials: $allowCreds"
    }
    Write-Host ''

    # ---- 19. HTTP to HTTPS redirect ----
    Write-Host '19. HTTP to HTTPS redirect'
    if ($Script:UriParts.Scheme -eq 'https') {
        $httpUrl = "http://$($Script:UriParts.Host)"
        if ($Script:UriParts.Port -ne 443 -and $Script:UriParts.Port -ne -1) {
            $httpUrl += ":$($Script:UriParts.Port)"
        }
        try {
            $httpResp = Invoke-WebRequest -Uri $httpUrl -Method Head -UseBasicParsing `
                -MaximumRedirection 0 -TimeoutSec 5 -ErrorAction Stop
            Fail "HTTP does not redirect (status: $($httpResp.StatusCode))"
        } catch {
            $errStatus = 0
            if ($_.Exception.Message -match '\b(30[12])\b') {
                $errStatus = [int]$Matches[1]
            }
            if ($errStatus -eq 301 -or $errStatus -eq 302) {
                Pass "HTTP redirects to HTTPS ($errStatus)"
            } else {
                Info "HTTP request failed — may be blocked or unavailable (OK for HTTPS-only)"
            }
        }
    } else {
        Warn 'Server uses HTTP — no redirect check possible'
    }
    Write-Host ''

    # ---- 20. Backup endpoint ----
    Write-Host '20. Backup endpoint'
    $backupTest = Invoke-Api -BaseUrl $ServerUrl -Path '/api/admin/backups' -ApiKey $ApiKey
    if ($backupTest['Success'] -and $backupTest['StatusCode'] -eq 200) {
        $backupData = $backupTest['Content'] | ConvertFrom-Json
        $count = if ($backupData -is [System.Array]) { $backupData.Count } elseif ($backupData.success -and $backupData.data) { $backupData.data.Count } else { 0 }
        Pass "Backup endpoint accessible ($count backups)"
    } elseif ($backupTest['StatusCode'] -eq 403) {
        Info 'Backup endpoint requires admin key (current key is user-level)'
    } elseif ($backupTest['StatusCode'] -eq 404) {
        Info 'Backup endpoint not available'
    } else {
        Fail "Backup endpoint failed (HTTP $($backupTest['StatusCode']))"
    }
    Write-Host ''

    # ---- 21. Client config string ----
    Write-Host '21. Client config strings'
    Info "Admin: ${ServerUrl}/?config=1&server=${ServerUrl}&key=${ApiKey}"
    Info "View:  ${ServerUrl}/"
    Write-Host ''

} else {
    # ---- LOCAL MODE (original checks) ----
    $Root = $PSScriptRoot | Split-Path -Parent
    $envFile = Join-Path $Root 'server\.env'

    function Check-Command {
        param([string]$Name)
        try {
            $cmd = Get-Command $Name -ErrorAction Stop
            $verStr = (& $cmd --version 2>&1 | Out-String).Trim()
            Info "${Name}: $verStr"
            Pass "$Name is installed"
        } catch {
            Fail "$Name is not installed"
        }
    }

    function Check-File {
        param([string]$Path, [string]$Label = '')
        $display = if ($Label) { $Label } else { $Path }
        if (Test-Path -LiteralPath $Path) {
            Pass $display
            $null, $true
        } else {
            Fail $display
            $null, $false
        }
    }

    function Check-Directory {
        param([string]$Path, [string]$Label = '')
        $display = if ($Label) { $Label } else { $Path }
        if (Test-Path -LiteralPath $Path -PathType Container) {
            Pass $display
            $null, $true
        } else {
            Fail $display
            $null, $false
        }
    }

    function Get-EnvValue {
        param([string]$Key, [string]$FilePath)
        if (Test-Path -LiteralPath $FilePath) {
            $line = Select-String -Path $FilePath -Pattern "^${Key}=" | Select-Object -First 1
            if ($line) {
                $val = $line.Line.Split('=', 2)[1]
                $idx = $val.IndexOf('#')
                if ($idx -ge 0) { $val = $val.Substring(0, $idx) }
                $val.Trim()
            }
        }
    }

    function Get-PackageVersion {
        param([string]$JsonPath)
        if (Test-Path -LiteralPath $JsonPath) {
            (Get-Content -Raw -LiteralPath $JsonPath | ConvertFrom-Json).version
        }
    }

    Write-Host ''
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host '  Bughouse Chess Ladder - Local Verify' -ForegroundColor Cyan
    Write-Host "  Root: $Root" -ForegroundColor Cyan
    Write-Host "  Fast: $($Fast.ToString().ToUpper())" -ForegroundColor Cyan
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host ''

    Write-Host '1. Basic tools'
    Check-Command 'node'
    Check-Command 'npm'
    Check-Command 'git'
    Write-Host ''

    Write-Host '2. Node.js version'
    try {
        $nodeVer = (node --version 2>&1 | Out-String).Trim()
        $major = [int]($nodeVer -replace 'v(\d+).*', '$1')
        if ($major -ge 20) {
            Pass "Node.js $nodeVer (>= 20 required)"
        } else {
            Fail "Node.js $nodeVer — need >= 20"
        }
    } catch {
        Fail "Could not determine Node.js version"
    }
    Write-Host ''

    Write-Host '3. Git repo'
    if (Test-Path -LiteralPath (Join-Path $Root '.git')) {
        Pass 'Git repository'
        try {
            Info "Remote: $(git -C $Root remote get-url origin 2>$null)"
            Info "Branch: $(git -C $Root branch --show-current 2>$null)"
            Info "Commit: $(git -C $Root log -1 --oneline 2>$null)"
        } catch { }
    } else {
        Fail 'Not a git repository'
    }
    Write-Host ''

    Write-Host '4. Project structure'
    Check-File (Join-Path $Root 'package.json') | Out-Null
    Check-File (Join-Path $Root 'server\package.json') | Out-Null
    Check-File (Join-Path $Root 'tsconfig.json') | Out-Null
    Check-File (Join-Path $Root 'server\tsconfig.json') | Out-Null
    Check-File (Join-Path $Root 'shared\tsconfig.json') | Out-Null
    Check-File (Join-Path $Root 'server\src\index.ts') | Out-Null
    Check-Directory (Join-Path $Root 'scripts') | Out-Null
    Check-File (Join-Path $Root 'scripts\compile-shared.js') | Out-Null
    Check-File (Join-Path $Root 'scripts\patch-shared-imports.js') | Out-Null
    Check-File (Join-Path $Root 'scripts\flatten-server-dist.js') | Out-Null
    Write-Host ''

    Write-Host '5. Dependencies'
    if (Check-Directory (Join-Path $Root 'node_modules') 'Root node_modules') {
        if (Test-Path (Join-Path $Root 'node_modules\react\package.json')) { Pass 'React installed' }
        else { Warn 'React not found in node_modules' }
    } else { Warn 'Run "npm install" in project root' }
    if (Check-Directory (Join-Path $Root 'server\node_modules') 'Server node_modules') {
        if (Test-Path (Join-Path $Root 'server\node_modules\express\package.json')) { Pass 'Express installed' }
        else { Warn 'Express not found in server/node_modules' }
    } else { Warn 'Run "npm install" in server/' }
    Write-Host ''

    Write-Host '6. Environment'
    if (Check-File $envFile 'server/.env') {
        $adminKey = Get-EnvValue 'ADMIN_API_KEY' $envFile
        $userKey  = Get-EnvValue 'USER_API_KEY' $envFile
        $nodeEnv  = Get-EnvValue 'NODE_ENV' $envFile
        $port     = Get-EnvValue 'PORT' $envFile
        $cors     = Get-EnvValue 'CORS_ORIGINS' $envFile
        $tabFile  = Get-EnvValue 'TAB_FILE_PATH' $envFile
        $neDisp = if ($nodeEnv) { $nodeEnv } else { '(default: development)' }
        $pDisp = if ($port) { $port } else { '(default: 3000)' }
        $cDisp = if ($cors) { $cors } else { '(default: *)' }
        $tDisp = if ($tabFile) { $tabFile } else { '(default: ./data/ladder.tab)' }
        Info "NODE_ENV: $neDisp"
        Info "PORT:     $pDisp"
        Info "CORS:     $cDisp"
        Info "TAB_FILE: $tDisp"
        if ($adminKey) { Pass "ADMIN_API_KEY is set ($($adminKey.Length) chars)" }
        elseif ($nodeEnv -eq 'production') { Fail 'ADMIN_API_KEY is empty — server will NOT start in production' }
        else { Warn 'ADMIN_API_KEY not set — admin endpoints unprotected' }
        if ($userKey) { Pass 'USER_API_KEY is set' }
        elseif ($nodeEnv -eq 'production') { Fail 'USER_API_KEY is empty — server will NOT start in production' }
        else { Warn 'USER_API_KEY not set — write endpoints unprotected' }
        if ($adminKey -eq 'dev-admin-key-change-in-production') { Warn 'ADMIN_API_KEY is still the default dev value' }
        if ($userKey -eq 'change-this-to-a-random-key') { Warn 'USER_API_KEY is still the default dev value' }
    } else { Fail 'server/.env missing — copy from server/.env.example' }
    Write-Host ''

    Write-Host '7. Build artifacts'
    if (Check-Directory (Join-Path $Root 'dist') 'dist/') {
        if (Test-Path (Join-Path $Root 'dist\index.html')) {
            Info "dist/index.html: $((Get-Item (Join-Path $Root 'dist\index.html')).Length) bytes"
        } else { Fail 'dist/index.html missing' }
    } else { Warn 'Run "npm run build" in project root' }
    if (Check-Directory (Join-Path $Root 'server\dist') 'server/dist/') {
        if (Test-Path (Join-Path $Root 'server\dist\index.js')) {
            Info "server/dist/index.js: $((Get-Item (Join-Path $Root 'server\dist\index.js')).Length) bytes"
        } else { Fail 'server/dist/index.js missing' }
    } else { Warn 'Run "npm run build" in server/' }
    @('constants.js', 'types\index.js', 'utils\tabUtils.js') | ForEach-Object {
        Check-File (Join-Path $Root "shared\$_") "shared/$_" | Out-Null
    }
    Write-Host ''

    Write-Host '8. Version consistency'
    $clientVer = Get-PackageVersion (Join-Path $Root 'package.json')
    $serverVer = Get-PackageVersion (Join-Path $Root 'server\package.json')
    if ($clientVer -and $serverVer) {
        if ($clientVer -eq $serverVer) { Pass "Client $clientVer == Server $serverVer" }
        else { Fail "Client $clientVer != Server $serverVer" }
    } else { Warn 'Could not read version from package.json files' }
    Write-Host ''

    Write-Host '9. Data files'
    if (Check-File (Join-Path $Root 'server\data\ladder.tab') 'server/data/ladder.tab') {
        Info "ladder.tab: $((Get-Content -LiteralPath (Join-Path $Root 'server\data\ladder.tab')).Count) lines"
    } else { Warn 'ladder.tab missing — server will create an empty one on startup' }
    Check-Directory (Join-Path $Root 'server\data') 'server/data/' | Out-Null
    Write-Host ''

    Write-Host '10. TypeScript typecheck'
    if ($Fast) { Info 'Skipped (-Fast)' }
    else {
        try {
            npm -C $Root run typecheck 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Pass 'Root typecheck passes' }
            else { Fail 'Root typecheck failed' }
        } catch { Fail "npm run typecheck error: $_" }
        try {
            npm -C (Join-Path $Root 'server') run typecheck 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) { Pass 'Server typecheck passes' }
            else { Fail 'Server typecheck failed' }
        } catch { Fail "npm run typecheck (server) error: $_" }
    }
    Write-Host ''

    Write-Host '11. Port availability'
    $port = Get-EnvValue 'PORT' $envFile
    if (-not $port) { $port = '3000' }
    Info "Checking port $port"
    if (-not $Fast) {
        try {
            $listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
            if ($listener) { Fail "Port $port is IN USE by PID $($listener.OwningProcess)" }
            else { Pass "Port $port is free" }
        } catch {
            try {
                $test = New-Object System.Net.Sockets.TcpClient
                $test.Connect('localhost', $port)
                $test.Close()
                Fail "Port $port is IN USE"
            } catch { Pass "Port $port is free" }
        }
    }
    Write-Host ''

    Write-Host '12. Server health check'
    if ($Fast) { Info 'Skipped (-Fast)' }
    else {
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:$port/health" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                $body = $resp.Content | ConvertFrom-Json
                Pass "Server is running (v$($body.version))"
            } else { Fail "Health check returned $($resp.StatusCode)" }
        } catch {
            Info "Server not running on port $port (start with 'npm run dev' in server/)"
        }
    }
    Write-Host ''
}

# ---- Summary ----
Write-Host '========================================' -ForegroundColor Cyan
Write-Host "  Summary: $($Script:PassCount) passed, $($Script:FailCount) failed, $($Script:WarnCount) warnings" -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor Cyan
Write-Host ''

if ($Script:FailCount -gt 0) {
    Write-Host 'Fix the [FAIL] items above and re-run.' -ForegroundColor Red
}
if ($Script:WarnCount -gt 0) {
    Write-Host 'Review the [WARN] items above if needed.' -ForegroundColor Yellow
}
if ($Script:FailCount -eq 0 -and $Script:WarnCount -eq 0) {
    Write-Host 'Everything looks good!' -ForegroundColor Green
}

if ($Script:FailCount -gt 0) { exit 1 }
