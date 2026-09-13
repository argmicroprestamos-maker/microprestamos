$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run web:build
  $apk = Join-Path $root 'apps/web/public/downloads/microprestamos.apk'
  if (!(Test-Path $apk)) { throw 'APK missing' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $hash = ([System.BitConverter]::ToString($sha.ComputeHash([System.IO.File]::ReadAllBytes($apk))).Replace('-', '')) } finally { $sha.Dispose() }
  if ($hash -ne '006E362FAC3E786B61F4298464F5DD7D5CC7F3872539E51AF47EC48D1AAEE80A') { throw "Unexpected APK SHA-256: $hash" }
  & 'C:\Users\danif\AppData\Local\Android\Sdk\build-tools\35.0.0\apksigner.bat' verify $apk
  $health = Invoke-RestMethod 'https://yncfmpbapocdxcmqdeke.supabase.co/functions/v1/health'
  if (!$health.ok) { throw 'Supabase health check failed' }
  try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'https://yncfmpbapocdxcmqdeke.supabase.co/functions/v1/client-api/quote' -ContentType 'application/json' -Body '{"principal":10000,"interest_rate_percent":10,"installment_count":3}' | Out-Null; throw 'client-api accepted an unauthenticated request' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
  try { Invoke-WebRequest -UseBasicParsing -Method Post -Uri 'https://yncfmpbapocdxcmqdeke.supabase.co/functions/v1/integration-v1/quotes' -ContentType 'application/json' -Body '{"principal":10000,"interest_rate_percent":10,"installment_count":3}' | Out-Null; throw 'integration-v1 accepted an unsigned request' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 401) { throw } }
  Write-Output 'SMOKE_OK'
} finally { Pop-Location }
