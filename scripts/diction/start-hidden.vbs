Option Explicit
Dim shell, files, root, nodePath, runner
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(files.GetParentFolderName(files.GetParentFolderName(WScript.ScriptFullName)))
nodePath = shell.ExpandEnvironmentStrings("%ProgramFiles%") & "\nodejs\node.exe"
runner = root & "\scripts\diction\run-server.cjs"
shell.Run Chr(34) & nodePath & Chr(34) & " " & Chr(34) & runner & Chr(34), 0, False
