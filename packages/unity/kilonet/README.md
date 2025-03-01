<center>
<a alt="KBVE Logo" href="https://kbve.com/" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/KBVE/kbve.com/main/public/assets/img/letter_logo.png" width="200"></a>
</center>

---

## Kilonet

![Discord](https://img.shields.io/discord/342732838598082562?logo=discord)


This is a sample unity for Supabase integration within Rareicon and a couple inhouse games that are we building or partnering with.
I will wrap back around and update this package more often once we get the realtime operational on the supabse instance.

Unity Version: 6000.0.25f1
Packages: MM/TPD, VuPlex (Desktop/WebGL)
Issue tickets can be found via unity tag, still need to link the issues directly to discord.
Adding the itch io release of the webgl build.
Updating the distance for the ally.
Added WebGL build optimizations.
Started the IFrame Interactions but need to fix the cross origin issue.
Added the `com.unity.transport` to the packages.
Preparing the Discord build - ETA 12 hours.
Adding new tilemap generator script and fixed some asmdefs.
Triggering another build once more, oh boi, another docker build.
We got the helm chart working and now are preparing for a basic multiplayer game.
The WebGL build is a bit slower and needs some adjustments, starting the test case now.
Vcontainers added and a new model is coming soon, getting the build ready to be triggered!
Last build failed, maybe we are back at our gh action failing again. There are two possible options, first is to downgrade the runner and the other is to disable the SuperTiled package.
11-28-2024 - Removing the SuperUnityTiled2PackageMeme and seeing if it builds without it?
11-29-2024 - Build works but websockets are still giving us a bit of pain, let me see what we can do about it.
11-30-2024 - Updating the env and preparing a test case deployment. Forgot the variable name.
12-02-2024 - Starting JavaScript FFI.
12-10-2024 - Trigger the first step of the js ffi.
12-28-2024 - JS FFI Build Fix, build 2.0

- [KBVE](https://kbve.com/)
- [RareIcon](https://rareicon.com/)