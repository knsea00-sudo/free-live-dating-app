@echo off
title Random Live Chat - 24/7 Server Runner
color 0a
echo ======================================================================
echo               RANDOM LIVE CHAT - 24/7 SERVER RUNNER
echo ======================================================================
echo.
echo Platform Owner: knsea00@gmail.com
echo Web Address:    http://localhost:3000/ or http://localhost/
echo.
cd /d "C:\Users\d_pin\.gemini\antigravity\scratch\pulselive"

:loop
echo [%time%] Starting Random Live Chat Platform...
call "C:\Users\d_pin\AppData\Roaming\Antigravity\bin\agy-node.cmd" server.js
echo.
echo [NOTE] Server exited. Restarting automatically in 3 seconds...
timeout /t 3 >nul
goto loop
