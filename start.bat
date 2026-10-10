@echo off
rem Install (first run only) and start Eden on Windows. Double-click this file.
rem Options (from a terminal):  start.bat --lite   start.bat --lan
cd /d "%~dp0"
title EDEN VIDEO

where py >nul 2>nul
if %errorlevel%==0 (
  py -3 scripts\bootstrap.py %*
  goto done
)
where python >nul 2>nul
if %errorlevel%==0 (
  python scripts\bootstrap.py %*
  goto done
)

echo.
echo   Eden needs Python 3.10 or newer, and it was not found.
echo   Install it from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" on the first screen of the installer.
echo   Then double-click start.bat again.
echo.

:done
if errorlevel 1 (
  echo.
  echo   Eden stopped. The message above says why.
  pause
)
