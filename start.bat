@echo off
title SiteAlyze VN - Dev Server
cd /d "%~dp0"

if not exist "node_modules" (
  echo [SiteAlyze] Lan dau chay - cai dat thu vien...
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] npm install that bai. Kiem tra ket noi mang hoac cai Node.js tu nodejs.org
    pause
    exit /b 1
  )
)

echo [SiteAlyze] Khoi dong dev server...
echo Mo trinh duyet o http://localhost:5173
start "" http://localhost:5173
call npm run dev
pause
