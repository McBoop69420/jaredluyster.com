' Runs run-comic-tracker.sh with no console window, appending its output to
' C:\Users\Jared Server\comic-reminders\comic-tracker.log. Scheduled Task
' "Comic Tracker" (daily 7:00 AM and 7:00 PM, as the logged-on user so git can push
' with the Windows credential manager and wrangler sees the user's
' CLOUDFLARE_API_TOKEN) points at this file in the dedicated clone. Window style
' 0 = hidden; True = wait, so the script's exit code becomes the task's last result.
Set sh = CreateObject("WScript.Shell")
rc = sh.Run("""C:\Program Files\Git\bin\bash.exe"" -lc ""'/c/Users/Jared Server/comic-reminders/jaredluyster.com/scripts/comic-tracker/run-comic-tracker.sh' >> '/c/Users/Jared Server/comic-reminders/comic-tracker.log' 2>&1""", 0, True)
WScript.Quit rc
