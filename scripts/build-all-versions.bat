@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion

REM ============================================================
REM SiteAlyze VN — Build all versions to standalone folders
REM ============================================================
REM Tự động checkout từng git tag, build, copy ra folder riêng.
REM Output: ..\SiteAlyze-Versions\<version>\ (folder ngoài repo)

set "REPO_DIR=%~dp0.."
set "OUT=%REPO_DIR%\..\SiteAlyze-Versions"
set "TAGS=v0.1.0-phase1 v0.2.0-roads v0.4.0-stable"

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   SiteAlyze VN — Build tất cả phiên bản                 ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
echo Output folder: %OUT%
echo Tags sẽ build: %TAGS%
echo.

cd /d "%REPO_DIR%"

REM Check git installed
where git >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Không tìm thấy git. Cài Git for Windows: https://git-scm.com/
  pause
  exit /b 1
)

REM Check npm installed
where npm >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Không tìm thấy npm. Cài Node.js: https://nodejs.org/
  pause
  exit /b 1
)

REM Lưu branch hiện tại để restore sau
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD') do set "ORIG_BRANCH=%%b"
echo [INFO] Branch hiện tại: %ORIG_BRANCH% — sẽ restore sau khi build xong.
echo.

REM Tạo output folder nếu chưa có
if not exist "%OUT%" mkdir "%OUT%"

REM Build từng tag
for %%V in (%TAGS%) do (
  echo.
  echo ──────────────────────────────────────────────────────────
  echo [Building %%V]
  echo ──────────────────────────────────────────────────────────

  git checkout %%V
  if errorlevel 1 (
    echo [BỎ QUA] Tag %%V không tồn tại — bỏ qua.
    goto :next_%%V
  )

  call npm install --silent
  call npm run build
  if errorlevel 1 (
    echo [LỖI] Build %%V thất bại — bỏ qua.
    goto :next_%%V
  )

  REM Xoá output cũ và copy mới
  if exist "%OUT%\%%V" rmdir /S /Q "%OUT%\%%V"
  xcopy /E /I /Q dist "%OUT%\%%V" >nul

  REM Tạo file MỞ APP.bat
  > "%OUT%\%%V\MỞ APP.bat" echo @echo off
  >> "%OUT%\%%V\MỞ APP.bat" echo cd /d "%%~dp0"
  >> "%OUT%\%%V\MỞ APP.bat" echo echo Đang khởi động SiteAlyze %%V tại http://localhost:8080
  >> "%OUT%\%%V\MỞ APP.bat" echo start http://localhost:8080
  >> "%OUT%\%%V\MỞ APP.bat" echo npx serve -l 8080 .

  echo [OK] %%V → %OUT%\%%V\
  :next_%%V
)

REM Restore branch
git checkout %ORIG_BRANCH%

REM Copy serve-all.bat ra root output folder
copy /Y "%REPO_DIR%\scripts\serve-all.bat" "%OUT%\serve-all.bat" >nul

REM Copy CHANGELOG cho user dễ đọc
copy /Y "%REPO_DIR%\CHANGELOG_VN.md" "%OUT%\CHANGELOG_VN.md" >nul

echo.
echo ╔══════════════════════════════════════════════════════════╗
echo ║   Hoàn tất! Mở folder: %OUT%
echo ╚══════════════════════════════════════════════════════════╝
echo.
explorer "%OUT%"
pause
