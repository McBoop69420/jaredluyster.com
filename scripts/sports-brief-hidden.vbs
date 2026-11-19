' Runs sports-brief.sh with no console window, appending its output to
' C:\Users\Jared Server\sports-brief\sports-brief.log. Scheduled Task
' "Sports Daily Brief" (daily 7:30 AM Eastern, as the logged-on user so git can push
' with the Windows credential manager) points at this file in the dedicated
' clone. Window style 0 = hidden; True = wait, so the script's exit code
' becomes the task's last result.
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("""C:\Program Files\Git\bin\bash.exe"" -lc ""'/c/Users/Jared Server/sports-brief/jaredluyster.com/scripts/sports-brief.sh' >> '/c/Users/Jared Server/sports-brief/sports-brief.log' 2>&1""", 0, True)
WScript.Quit rc
