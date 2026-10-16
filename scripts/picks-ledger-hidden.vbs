' Runs picks-ledger.sh with no console window, appending its output to
' C:\Users\Jared Server\picks-ledger\picks-ledger.log. Scheduled Task
' "Sports Picks Ledger" (daily 6:00 AM, as the logged-on user so git can push
' with the Windows credential manager) points at this file in the dedicated
' clone. Window style 0 = hidden; True = wait, so the script's exit code
' becomes the task's last result.
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("""C:\Program Files\Git\bin\bash.exe"" -lc ""'/c/Users/Jared Server/picks-ledger/jaredluyster.com/scripts/picks-ledger.sh' >> '/c/Users/Jared Server/picks-ledger/picks-ledger.log' 2>&1""", 0, True)
WScript.Quit rc
