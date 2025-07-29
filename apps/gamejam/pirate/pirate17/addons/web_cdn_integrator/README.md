# Web CDN Integrator Plugin for Godot

This plugin automatically downloads JavaScript CDN files and integrates them into Godot web exports.

## Features

- Downloads JavaScript files from CDNs during export
- Replaces template placeholders in HTML with proper script tags
- Configurable through JSON configuration
- Supports multiple CDN libraries

## Installation

1. Copy the `addons/web_cdn_integrator` folder to your project
2. Enable the plugin in Project Settings > Plugins

## Configuration

Edit `cdn_config.json` to configure CDN libraries:

```json
{
  "library_name": {
    "enabled": true,
    "cdn_url": "https://cdn.example.com/library.min.js",
    "filename": "library.min.js",
    "template_tag": "$LIBRARY",
    "init_script": "optional initialization code"
  }
}
```

## Usage

1. Add template tags (e.g., `$SUPABASE`) in your HTML template
2. Configure the CDN in `cdn_config.json`
3. Export your project for web
4. The plugin will:
   - Download the CDN files
   - Include them in the export
   - Replace template tags with script tags

## Example

The plugin comes pre-configured for Supabase integration. Just add `$SUPABASE` in your HTML template where you want the script tag to appear.