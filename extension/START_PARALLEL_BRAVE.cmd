@echo off
setlocal
 title Store Coordinate Batch - Parallel Brave
 echo Close Brave using its menu - Exit before using this launcher.
 echo This launcher will not close any running browser for you.
 echo.
 tasklist /FI "IMAGENAME eq brave.exe" /NH 2>nul | find /I "brave.exe" >nul
 if not errorlevel 1 goto running
 set "BATCH_BRAVE_EXE="
 if exist "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BATCH_BRAVE_EXE=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
 if not defined BATCH_BRAVE_EXE if exist "%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BATCH_BRAVE_EXE=%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe"
 if not defined BATCH_BRAVE_EXE if exist "%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe" set "BATCH_BRAVE_EXE=%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"
 if not defined BATCH_BRAVE_EXE goto missing
 echo Opening Brave with background rendering restrictions disabled.
 echo Use the Brave profile where your extension and Business Manager login exist.
 start "" "%BATCH_BRAVE_EXE%" --disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --new-window "brave://version" "https://business.google.com/locations"
 exit /b 0
:running
 echo Brave is still running. Save your work and use Brave menu - Exit.
 echo Wait until Brave has fully exited, then run this file again.
 echo The launch settings cannot be applied to an already-running Brave session.
 pause
 exit /b 1
:missing
 echo Brave was not found in its standard installation folders.
 echo Send your Brave executable path so this launcher can be adjusted.
 pause
 exit /b 1
