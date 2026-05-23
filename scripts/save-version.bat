@echo off
REM ── SiteAlyze VN — Build + Snapshot trong 1 lệnh ──
REM Cách dùng: scripts\save-version.bat v0.7.0-sidebar-redesign
REM
REM Script này sẽ:
REM   1. Chạy npm run build (tạo folder dist)
REM   2. Copy dist sang versions/<VERSION>/
REM   3. Tạo file MO_APP.bat trong versions/<VERSION>/ để mở nhanh
REM   4. Tạo git tag <VERSION> để có thể checkout lại sau này

setlocal

if "%~1"=="" (
  echo.
  echo Cach dung: scripts\save-version.bat v0.X.Y-ten-version
  echo Vi du   : scripts\save-version.bat v0.7.0-sidebar-redesign
  echo.
  echo Phien ban hien co:
  dir /b /ad "%~dp0..\versions" 2^>nul
  exit /b 1
)

set VERSION=%~1
set ROOT=%~dp0..

echo.
echo ===========================================================
echo  SiteAlyze VN  --  Save Version "%VERSION%"
echo ===========================================================
echo.

REM ── Bước 1: Build ──
echo [1/3] Dang chay npm run build...
echo.
pushd "%ROOT%"
call npm run build
if errorlevel 1 (
  echo.
  echo [LOI] Build that bai. Dung lai.
  popd
  exit /b 1
)
popd

REM ── Bước 2: Snapshot ──
echo.
echo [2/3] Snapshot dist -^> versions\%VERSION%\
echo.
call "%~dp0snapshot-version.bat" %VERSION%
if errorlevel 1 (
  echo [LOI] Snapshot that bai.
  exit /b 1
)

REM ── Bước 3: Git tag ──
echo.
echo [3/3] Tao git tag...
git -C "%ROOT%" tag -a "%VERSION%" -m "Version %VERSION%" 2>nul
if errorlevel 1 (
  echo   ^(Tag da ton tai hoac chua co git -- bo qua^)
) else (
  echo   ^> Tao tag "%VERSION%" thanh cong
)

echo.
echo ===========================================================
echo  HOAN TAT! Phien ban "%VERSION%" da duoc luu tai:
echo    versions\%VERSION%\
echo.
echo  De mo: double-click versions\%VERSION%\MO_APP.bat
echo  De checkout code cu: git checkout %VERSION%
echo ===========================================================
echo.

endlocal
