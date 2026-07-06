# macOS Code Signing for Death Slayer

This document covers code signing configuration for Death Slayer and its launcher on macOS.

## Overview

macOS requires applications to be code-signed and notarized for distribution. This ensures:

- Users can run the app without security warnings
- The app can access network resources
- The app meets Apple's security requirements

## Prerequisites

1. **Apple Developer Account** ($99/year)
    - Enrolled in the Apple Developer Program
    - Access to certificates and provisioning

2. **Developer ID Application Certificate**
    - Download from Apple Developer portal
    - Install in Keychain Access
    - Export as `.p12` file with password

3. **App-Specific Password**
    - Generate from appleid.apple.com
    - Used for notarization automation

## GitHub Secrets Configuration

Add these secrets to your GitHub repository (`Settings > Secrets and variables > Actions`):

```yaml
APPLE_CERTIFICATE: <base64-encoded .p12 certificate>
APPLE_CERTIFICATE_PASSWORD: <certificate password>
APPLE_SIGNING_IDENTITY: 'Developer ID Application: Your Name (TEAM_ID)'
APPLE_ID: your-apple-id@email.com
APPLE_PASSWORD: app-specific-password
APPLE_TEAM_ID: TEAM_ID_HERE
```

### Generate Base64 Certificate

```bash
# Export certificate from Keychain as .p12
# Then encode to base64
base64 -i certificate.p12 | pbcopy
```

Paste the clipboard content as the `APPLE_CERTIFICATE` secret.

## Tauri Configuration

The launcher's `tauri.conf.json` includes macOS-specific bundle configuration:

```json
{
	"bundle": {
		"macOS": {
			"entitlements": null,
			"exceptionDomain": "",
			"frameworks": [],
			"providerShortName": null,
			"signingIdentity": null
		}
	}
}
```

### Entitlements File (Optional)

For network access and sandboxing, create `src-tauri/Entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.app-sandbox</key>
    <true/>
    <key>com.apple.security.network.client</key>
    <true/>
    <key>com.apple.security.network.server</key>
    <true/>
    <key>com.apple.security.files.user-selected.read-write</key>
    <true/>
</dict>
</plist>
```

## CI/CD Integration

### GitHub Actions Workflow

The existing CI/CD pipeline (`.github/workflows/ci-tauri-builder.yml`) handles code signing automatically:

```yaml
- name: Build Tauri App
  env:
      APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
      APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
      APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
      pnpm tauri build
```

### Manual Build with Signing

```bash
# Set environment variables
export APPLE_CERTIFICATE="$(cat certificate.p12 | base64)"
export APPLE_CERTIFICATE_PASSWORD="your-password"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAM_ID)"
export APPLE_ID="your-apple-id@email.com"
export APPLE_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="TEAM_ID"

# Build
cd apps/deathslayer/deathslayer-launcher
pnpm tauri build
```

## Notarization Process

Tauri 2 automatically handles notarization when environment variables are set:

1. **Build** - Compiles and signs the app bundle
2. **Submit** - Uploads to Apple's notarization service
3. **Staple** - Attaches notarization ticket to the app
4. **Verify** - Confirms successful notarization

Check notarization status:

```bash
# Get submission ID from build output
xcrun notarytool history --apple-id your-apple-id@email.com \
  --password app-specific-password --team-id TEAM_ID

# Check specific submission
xcrun notarytool log <submission-id> --apple-id your-apple-id@email.com \
  --password app-specific-password --team-id TEAM_ID
```

## Unreal Engine Game Builds

For the main Death Slayer UE5 game on macOS:

### UE5 Build Configuration

Add to `Config/DefaultEngine.ini`:

```ini
[/Script/MacTargetPlatform.MacTargetSettings]
BundleIdentifier=com.kbve.deathslayer
CodeSigningPrefix=Developer ID Application: Your Name (TEAM_ID)
```

### Sign UE5 Build

```bash
# Navigate to built .app bundle
cd path/to/DeathSlayer.app

# Sign all frameworks and dylibs first
find . -name "*.dylib" -exec codesign -s "Developer ID Application: Your Name (TEAM_ID)" {} \;
find . -name "*.framework" -exec codesign -s "Developer ID Application: Your Name (TEAM_ID)" {} \;

# Sign the main executable
codesign -s "Developer ID Application: Your Name (TEAM_ID)" \
  --deep --force --options runtime \
  --entitlements path/to/Entitlements.plist \
  Contents/MacOS/DeathSlayer

# Sign the app bundle
codesign -s "Developer ID Application: Your Name (TEAM_ID)" \
  --deep --force --options runtime \
  --entitlements path/to/Entitlements.plist \
  ../DeathSlayer.app

# Verify
codesign --verify --verbose ../DeathSlayer.app
spctl --assess --verbose ../DeathSlayer.app
```

### Create DMG and Notarize

```bash
# Create DMG
hdiutil create -volname "Death Slayer" -srcfolder DeathSlayer.app \
  -ov -format UDZO DeathSlayer.dmg

# Sign DMG
codesign -s "Developer ID Application: Your Name (TEAM_ID)" DeathSlayer.dmg

# Notarize DMG
xcrun notarytool submit DeathSlayer.dmg \
  --apple-id your-apple-id@email.com \
  --password app-specific-password \
  --team-id TEAM_ID \
  --wait

# Staple notarization ticket
xcrun stapler staple DeathSlayer.dmg

# Verify
spctl --assess --type open --context context:primary-signature \
  --verbose DeathSlayer.dmg
```

## UE5 CI/CD Integration

Update `.github/workflows/ci-unreal-build.yml` to include macOS signing:

```yaml
- name: Sign macOS Build
  if: matrix.platform == 'Mac'
  env:
      APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
  run: |
      # Sign all components
      find Build/Mac/*.app -name "*.dylib" -exec codesign -s "$APPLE_SIGNING_IDENTITY" {} \;
      find Build/Mac/*.app -name "*.framework" -exec codesign -s "$APPLE_SIGNING_IDENTITY" {} \;

      # Sign main app
      codesign -s "$APPLE_SIGNING_IDENTITY" --deep --force --options runtime \
        Build/Mac/DeathSlayer.app

- name: Notarize macOS Build
  if: matrix.platform == 'Mac'
  env:
      APPLE_ID: ${{ secrets.APPLE_ID }}
      APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
      APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
  run: |
      # Create and sign DMG
      hdiutil create -volname "Death Slayer" -srcfolder Build/Mac/DeathSlayer.app \
        -ov -format UDZO DeathSlayer.dmg
      codesign -s "$APPLE_SIGNING_IDENTITY" DeathSlayer.dmg

      # Notarize
      xcrun notarytool submit DeathSlayer.dmg \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait

      # Staple
      xcrun stapler staple DeathSlayer.dmg
```

## Troubleshooting

### Common Issues

1. **"App is damaged and can't be opened"**
    - App not signed or notarized
    - Quarantine flag set: `xattr -cr /path/to/app`

2. **"Developer cannot be verified"**
    - App signed but not notarized
    - Submit for notarization

3. **Signature verification fails**
    - Sign frameworks and dylibs before main executable
    - Use `--deep --force` flags

4. **Notarization rejected**
    - Check notarization log for specific issues
    - Common: hardened runtime not enabled, invalid entitlements

### Verify Signing

```bash
# Check signature
codesign --verify --verbose /path/to/app

# Display signature info
codesign -dvvv /path/to/app

# Check notarization
spctl --assess --verbose /path/to/app

# Check quarantine
xattr -l /path/to/app
```

## References

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Tauri Code Signing Documentation](https://tauri.app/v2/guides/distribution/sign-macos)
- [Unreal Engine macOS Publishing](https://docs.unrealengine.com/5.0/en-US/publishing-to-macos-in-unreal-engine/)

## Security Notes

- **Never commit certificates or passwords to version control**
- Use GitHub secrets for all sensitive values
- Rotate app-specific passwords periodically
- Restrict access to signing certificates
- Use different certificates for development and distribution

## Support

For issues with code signing:

1. Check Apple Developer forums
2. Review notarization logs
3. Verify certificate validity in Keychain Access
4. Ensure app-specific password is current
