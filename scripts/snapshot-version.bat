@echo off
REM ── SiteAlyze VN — Snapshot phiên bản vào folder versions ──
REM Cách dùng: scripts\snapshot-version.bat v0.6.0-flood-climate

setlocal

if "%~1"=="" (
  echo Cách dùng: scripts\snapshot-version.bat v0.X.Y-ten-version
  echo Ví dụ   : scripts\snapshot-version.bat v0.6.0-flood-climate
  exit /b 1
)

set VERSION=%~1
set ROOT=%~dp0..
set SRC=%ROOT%\dist
set DST=%ROOT%\versions\%VERSION%

echo.
echo ── SiteAlyze VN — Snapshot "%VERSION%" ──
echo.

REM Kiểm tra dist có tồn tại không
if not exist "%SRC%\index.html" (
  echo [LỖI] Chưa có folder dist. Hãy chạy "npm run build" trước.
  exit /b 1
)

REM Kiểm tra version đã tồn tại
if exist "%DST%" (
  echo [CẢNH BÁO] Phiên bản "%VERSION%" đã tồn tại tại:
  echo   %DST%
  set /p CONFIRM=Ghi đè? (y/N):
  if /i not "%CONFIRM%"=="y" (
    echo Hủy.
    exit /b 0
  )
  rmdir /s /q "%DST%"
)

REM Copy dist → versions\VERSION
echo Đang copy dist → versions\%VERSION%...
xcopy /E /I /Q "%SRC%" "%DST%" > nul
if errorlevel 1 (
  echo [LỖI] Copy thất bại.
  exit /b 1
)

REM Tạo file ▶ MO_APP.bat để mở dễ dàng
set PORT=8080
REM Tính port dựa theo số version (tránh xung đột)
for /f "tokens=2 delims=." %%a in ("%VERSION%") do set MINOR=%%a
set /a PORT=8080+%MINOR%

(
echo @echo off
echo echo Đang khởi động SiteAlyze VN %VERSION%...
echo echo Truy cập: http://localhost:%PORT%
echo start http://localhost:%PORT%
echo npx serve -s . -l %PORT%
echo pause
) > "%DST%\▶ MO_APP.bat"

echo.
echo ✓ Đã tạo snapshot: versions\%VERSION%\
echo ✓ Port: http://localhost:%PORT%
echo ✓ Mở bằng: double-click "▶ MO_APP.bat"
echo.

REM Cập nhật git tag
git -C "%ROOT%" tag -a "%VERSION%" -m "Version %VERSION%" 2>nul
if errorlevel 0 (
  echo ✓ Đã tạo git tag "%VERSION%"
) else (
  echo   (Git tag đã tồn tại hoặc git chưa setup — bỏ qua)
)

endlocal
