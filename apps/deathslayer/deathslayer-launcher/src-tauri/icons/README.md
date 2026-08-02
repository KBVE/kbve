# Launcher Icons

> **TODO — these are placeholders, not final art.**
>
> The icons currently committed here are a deliberately generic flat-slate
> square with no logo, wordmark or game artwork. They exist only so
> `tauri::generate_context!` resolves and the crate can be built and tested.
>
> **Replace them before any public or release build.** Once real source art
> exists, regenerate the whole set with the Tauri CLI (see below) and delete
> this notice.

Place launcher icons in this directory:

- `32x32.png` - 32x32 pixel icon
- `128x128.png` - 128x128 pixel icon
- `128x128@2x.png` - 256x256 pixel icon (retina)
- `icon.icns` - macOS icon bundle
- `icon.ico` - Windows icon

## Generate Icons

You can use the Tauri CLI to generate icons from a single source image:

```bash
pnpm tauri icon path/to/source-icon.png
```

This will automatically generate all required icon sizes.

## Requirements

- Source image should be at least 512x512 pixels
- PNG format with transparency
- Square aspect ratio

## macOS Code Signing

The `icon.icns` file will be included in the macOS app bundle and signed during the code signing process.
