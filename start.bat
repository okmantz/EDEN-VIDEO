@echo off
rem Install (first run only) and start Eden on Windows. Double-click this file.
rem Python and FFmpeg are installed for you if they are missing.
rem Options (from a terminal):  start.bat --lite   start.bat --lan
cd /d "%~dp0"
title EDEN VIDEO

set "PYEXE="
set "PYARG="

call :findpy
if defined PYEXE goto run

echo.
echo   Python is not installed yet. Eden will install it for you now (about a minute).
echo.
call :installpy
call :findpy
if defined PYEXE goto run

echo.
echo   Eden could not install Python automatically.
echo   Please install it yourself from https://www.python.org/downloads/
echo   and tick "Add python.exe to PATH" on the first screen of the installer.
echo   Then double-click start.bat again.
echo.
pause
exit /b 1

:run
"%PYEXE%" %PYARG% scripts\bootstrap.py %*
if errorlevel 1 (
  echo.
  echo   Eden stopped. The message above says why.
  pause
)
exit /b 0


rem ---------------------------------------------------------------------------
rem Looks for Python 3.10+ and sets PYEXE / PYARG. Ignores the Microsoft Store
rem "python" shortcut, which opens the Store instead of running Python.
:findpy
set "PYEXE="
set "PYARG="
py -3 -c "import sys;sys.exit(sys.version_info<(3,10))" >nul 2>nul
if not errorlevel 1 (
  set "PYEXE=py"
  set "PYARG=-3"
  exit /b 0
)
python -c "import sys;sys.exit(sys.version_info<(3,10))" >nul 2>nul
if not errorlevel 1 (
  set "PYEXE=python"
  exit /b 0
)
for %%V in (313 312 311 310) do (
  if exist "%LocalAppData%\Programs\Python\Python%%V\python.exe" (
    "%LocalAppData%\Programs\Python\Python%%V\python.exe" -c "import sys" >nul 2>nul
    if not errorlevel 1 (
      set "PYEXE=%LocalAppData%\Programs\Python\Python%%V\python.exe"
      exit /b 0
    )
  )
  if exist "%ProgramFiles%\Python%%V\python.exe" (
    set "PYEXE=%ProgramFiles%\Python%%V\python.exe"
    exit /b 0
  )
)
exit /b 1


rem ---------------------------------------------------------------------------
rem Installs Python for the current user (no admin rights needed).
:installpy
where winget >nul 2>nul
if not errorlevel 1 (
  winget install --id Python.Python.3.12 -e --scope user --silent --accept-package-agreements --accept-source-agreements
)
call :findpy
if defined PYEXE exit /b 0

echo   Downloading Python from python.org ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe' -OutFile \"$env:TEMP\eden-python-setup.exe\""
if exist "%TEMP%\eden-python-setup.exe" (
  echo   Installing Python ...
  "%TEMP%\eden-python-setup.exe" /quiet InstallAllUsers=0 PrependPath=1 Include_launcher=1 Include_test=0
  del "%TEMP%\eden-python-setup.exe" >nul 2>nul
)
exit /b 0
