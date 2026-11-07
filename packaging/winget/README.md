# winget package

The manifest for `DragAditya.Notchly` lives under `DragAditya.Notchly/<version>/`.

Validate it with:

```powershell
winget validate --manifest .\DragAditya.Notchly\1.2.1
```

Submit a new version with:

```powershell
wingetcreate submit --prtitle "New package: DragAditya.Notchly version 1.2.1" .\DragAditya.Notchly\1.2.1
```

The current submission is [microsoft/winget-pkgs#474260](https://github.com/microsoft/winget-pkgs/pull/474260).
It is waiting for the Microsoft CLA to be signed.
