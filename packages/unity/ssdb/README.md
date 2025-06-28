# SSDB - Steamworks Database for Unity

A lightweight Unity wrapper for Steamworks database operations, designed to simplify Steam integration with dependency injection support.

## Overview

SSDB provides an easy-to-use interface for common Steamworks database operations in Unity, including:
- User statistics tracking
- Achievement management
- Leaderboard operations
- Cloud save data management
- Steam workshop integration

## Features

- 🎯 **Simple API** - Clean, intuitive methods for common Steamworks operations
- 💉 **Dependency Injection Ready** - Built with DI frameworks in mind
- 🔒 **Type Safe** - Strongly typed interfaces and models
- 🚀 **Performance Optimized** - Efficient async operations with proper error handling
- 📱 **Unity Friendly** - Seamless integration with Unity's lifecycle and coroutines

## Installation

### Package Manager (Recommended)
1. Open Unity Package Manager
2. Click "Add package from git URL"
3. Enter: `https://github.com/kbve/kbve.git`

### Manual Installation
1. Download the latest release
2. Extract to your `Assets/Packages/` folder
3. Add the required dependencies

## Requirements

- Unity 6.0.X LTS or later
- Steamworks.NET
- Steam Client running
- Valid Steam App ID

## Best Practices

1. **Initialize Early** - Initialize SSDB in your game's startup sequence
2. **Handle Offline Mode** - Gracefully handle cases where Steam is offline
3. **Cache Data** - Cache frequently accessed data locally
4. **Batch Operations** - Group multiple stat updates together
5. **Error Recovery** - Implement retry logic for failed operations

## Dependencies

- [Steamworks.NET](https://steamworks.github.io/) - Steam API wrapper
- Unity 2022.3+ - Required Unity version
- .NET Standard 2.1 - For async/await support

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## Support

- 📖 [Documentation](https://github.com/your-repo/ssdb/wiki)
- 🐛 [Issue Tracker](https://github.com/your-repo/ssdb/issues)
- 💬 [Discord Community](https://discord.gg/your-server)

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a complete list of changes and updates.

---

**Note**: This package requires a valid Steam App ID and the Steam client to be running. Make sure to test thoroughly with Steam's development tools before releasing.