@echo off
chcp 65001 >nul

REM ============================================================
REM SiteAlyze VN — Serve all versions in parallel
REM ============================================================
REM Chạy 4 phiên bản trên 4 ports để so sánh trực quan.
REM File này được copy sang ..\SiteAlyze-Versions\ bởi build-all-versions.bat,
REM nhưng cũng chạy được trực tiếp từ scripts/ nếu có folder versions cùng cấp.

setlocal

REM Tự detect folder chứa versions: thử cùng cấp trước, sau đó parent\..\SiteAlyze-Versions
set "BASE=%~dp0"
if exist "%BASE%v0.4.0-stable\index.html" (
  set "ROOT=%BASE%"
) else if exist "%BASE%..\SiteAlyze-Versions\v0.4.0-stable\index.html" (
  set "ROOT=%BASE%..\SiteAlyze-Versions\"
) else (
  echo [LỖI] Không tìm thấy folder versions. Chạy build-all-versions.bat trước.
  pause
  exit /b 1
)

echo Đang khởi động tất cả phiên bản SiteAlyze VN...
echo.

if exist "%ROOT%v0.1.0-phase1\index.html" (
  start "v0.1" cmd /c "cd /d %ROOT%v0.1.0-phase1 && npx serve -l 8001 ."
  echo   v0.1.0-phase1 → http://localhost:8001
)
if exist "%ROOT%v0.2.0-roads\index.html" (
  start "v0.2" cmd /c "cd /d %ROOT%v0.2.0-roads && npx serve -l 8002 ."
  echo   v0.2.0-roads → http://localhost:8002
)
if exist "%ROOT%v0.4.0-stable\index.html" (
  start "v0.4" cmd /c "cd /d %ROOT%v0.4.0-stable && npx serve -l 8004 ."
  echo   v0.4.0-stable → http://localhost:8004
)

echo.
echo Đợi 4 giây để server khởi động...
timeout /t 4 >nul

echo Mở các tab trong trình duyệt...
if exist "%ROOT%v0.1.0-phase1\index.html" start http://localhost:8001
if exist "%ROOT%v0.2.0-roads\index.html"  start http://localhost:8002
if exist "%ROOT%v0.4.0-stable\index.html" start http://localhost:8004

echo.
echo Để dừng tất cả: đóng các cửa sổ Terminal "v0.X" mới mở.
pause
