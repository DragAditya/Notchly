# Chocolatey package

This directory contains the Chocolatey package definition for Notchly.

Build it with:

```powershell
choco pack
```

Publish it with a Chocolatey community repository API key:

```powershell
choco push notchly.1.2.1.nupkg --source https://push.chocolatey.org/ --api-key <key>
```

The package downloads the signed NSIS installer from the GitHub release and installs it per user.
