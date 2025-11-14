# ===============================
# NeoLearn Local Dev Launcher
# ===============================

Write-Host "`n🚀 Starting NeoLearn local environment..." -ForegroundColor Cyan

# Step 1: Move into project directory
Set-Location "E:\NEOLEARN\NeoLearn_serveronly_full"

# Step 2: Stop any old Node.js processes (if running)
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "🧹 Cleaned old Node processes." -ForegroundColor Yellow

# Step 3: Clear Next.js cache (for a fresh start)
if (Test-Path ".next") {
    Remove-Item -Recurse -Force ".next"
    Write-Host "🧼 Cleared .next cache." -ForegroundColor Yellow
}

# Step 4: Start NeoLearn in Turbopack (fast mode)
Write-Host "`n⚡ Launching NeoLearn Dev Server on http://localhost:3004 ..." -ForegroundColor Green
npm run dev:fast

# ===============================
# End of Script
# ===============================
