@echo off
title Setup lol-random-live-chat Domain
color 0a
echo ======================================================================
echo       Random Live Chat - Setting up http://lol-random-live-chat/
echo ======================================================================
echo.

:: Check for administrative rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ATTENTION] Administrative privileges required to update domain!
    echo.
    echo Please RIGHT-CLICK this file and choose:
    echo        "RUN AS ADMINISTRATOR"
    echo.
    pause
    exit /b 1
)

:: Append to hosts file if not already present
findstr /i "lol-random-live-chat" %windir%\System32\drivers\etc\hosts >nul
if %errorLevel% neq 0 (
    echo. >> %windir%\System32\drivers\etc\hosts
    echo 127.0.0.1  lol-random-live-chat >> %windir%\System32\drivers\etc\hosts
    echo [SUCCESS] Domain added to Windows hosts file!
) else (
    echo [INFO] lol-random-live-chat is already registered in your hosts file!
)

ipconfig /flushdns >nul
echo.
echo ======================================================================
echo Domain is ready! Now open your browser and visit:
echo.
echo        http://lol-random-live-chat/
echo.
echo ======================================================================
echo.
pause
