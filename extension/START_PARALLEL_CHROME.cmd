@echo off
setlocal
 title Store Coordinate Batch - Parallel Chrome
 echo Close Chrome using its menu - Exit before using this launcher.
 echo This launcher will not close any running browser for you.
 echo.
 tasklist /FI "IMAGENAME eq chrome.exe" /NH 2>nul | find /I "chrome.exe" >nul
 if not errorlevel 1 goto running
 set "BATCH_CHROME_EXE="
 if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "BATCH_CHROME_EXE=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
 if not defined BATCH_CHROME_EXE if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "BATCH_CHROME_EXE=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
 if not defined BATCH_CHROME_EXE if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "BATCH_CHROME_EXE=%LocalAppData%\Google\Chrome\Application\chrome.exe"
 if not defined BATCH_CHROME_EXE goto missing
 echo Opening Chrome with background rendering restrictions disabled.
 echo Use the Chrome profile where your extension and Business Manager login exist.
 start "" "%BATCH_CHROME_EXE%" --disable-backgrounding-occluded-windows --disable-background-timer-throttling --disable-renderer-backgrounding --disable-features=CalculateNativeWinOcclusion --new-window "chrome://version" "https://business.google.com/locations"
 exit /b 0
:running
 echo Chrome is still running. Save your work and use Chrome menu - Exit.
 echo Wait until Chrome has fully exited, then run this file again.
 echo The launch settings cannot be applied to an already-running Chrome session.
 pause
 exit /b 1
:missing
 echo Chrome was not found in its standard installation folders.
 echo Send your Chrome executable path so this launcher can be adjusted.
 pause
 exit /b 1
