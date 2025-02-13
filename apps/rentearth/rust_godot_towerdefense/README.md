# Rust GoDot Tower Defense

Preparing to trigger the build again, fixing the gitignore issue, once more.
Testing the rust build, lets hope it works out!


## Issues

### ERR
- Clock / Timer Extension needs to be in its own class.

### TODO
- Integrate a WebView , maybe a version from [Wry](https://github.com/doceazedo/godot_wry).


## Dev

### Builds

Quick list of the build commands:

```shell

./kbve.sh -nx rust_godot_towerdefense:build-windows

./kbve.sh -nx rust_godot_towerdefense:build-wsl

./kbve.sh -nx rust_godot_towerdefense:build-mac
```

The WSL build includes the Windows, WASM and Linux, while the Mac is just for the standard mac build.