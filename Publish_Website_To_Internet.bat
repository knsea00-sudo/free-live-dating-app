@echo off
title Random Live Chat - Public Internet Publisher
color 0a
echo ======================================================================
echo          RANDOM LIVE CHAT - PUBLISH TO THE WORLD WIDE WEB
echo ======================================================================
echo.
echo Starting secure public tunnel over HTTPS...
echo Anyone in the world on Android, iPhone, PC or Tablet will be able to join!
echo.

cd /d "%~dp0"
if exist "server.js" goto run_tunnel
cd /d "C:\Users\d_pin\.gemini\antigravity\scratch\pulselive"

:run_tunnel
echo [1/2] Connecting to global edge network...
echo [2/2] Generating your live HTTPS Public URL...
echo.
echo ======================================================================
echo Keep this window OPEN to keep your website live on the internet!
echo ======================================================================
echo.
ssh -o StrictHostKeyChecking=no -R 80:127.0.0.1:3000 nokey@localhost.run
pause
