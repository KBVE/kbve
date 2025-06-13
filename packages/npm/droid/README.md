---
title: droid
description: 
---
# Droid

<img align="right" width="150" height="50" title="KBVE logo"
     src="https://kbve.com/assets/images/brand/letter_logo.svg">

Droid is a lightweight manager for service workers, shared workers, and web workers in modern JavaScript and TypeScript applications.
It simplifies the setup, communication, and lifecycle management of workers, making it easier to offload heavy computations, enable background tasks, and improve the responsiveness of your web apps.
With Droid, you can quickly integrate multi-threaded capabilities into your projects with minimal boilerplate and maximum flexibility.

Droid provides a unified API to register, manage, and communicate with different types of web workers. Whether you are using service workers for offline support, shared workers for cross-tab communication, or web workers for parallel processing, Droid abstracts away the boilerplate and browser inconsistencies. It is designed to be framework-agnostic, making it suitable for use in vanilla JavaScript projects as well as with popular frameworks like React, Vue, or Angular. The library aims to help developers harness the power of multi-threading in the browser with simple, consistent patterns and robust error handling.

### Dependencies

Droid requires a few runtime dependencies to provide its full feature set:

- [tslib](https://www.npmjs.com/package/tslib): Runtime library for TypeScript helper functions
- [comlink](https://www.npmjs.com/package/comlink): Simplifies communication with web workers
- [@nanostores/persistent](https://www.npmjs.com/package/@nanostores/persistent): Persistent state management
- [dexie](https://www.npmjs.com/package/dexie): IndexedDB wrapper for browser storage
- [zod](https://www.npmjs.com/package/zod): TypeScript-first schema validation

These dependencies are automatically installed when you add Droid to your project. If you plan to use Droid with specific frameworks or build tools, you may need to install related peer dependencies (such as React, Vue, or Angular) according to your project requirements.

- Optional: TypeScript for type safety and better development experience
- Optional: Framework-specific packages if integrating with React, Vue, Angular, etc.

### Chores

Preparing to release next batch, trying to resolving the CDN issue.