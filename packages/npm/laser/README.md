# Laser

<a href="https://kbve.com" style="float: right;"><img width="150" height="50" title="KBVE logo" src="https://kbve.com/assets/images/brand/letter_logo.svg" /></a>

Laser is a lightweight integration layer for Phaser and React Three Fiber in React 19 applications.
It provides React hooks and components for embedding Phaser games and R3F scenes with a shared event bus, making it easy to build hybrid 2D/3D game UIs.

## Features

- **Phaser integration** — `<PhaserGame>` component with ref-based access, `usePhaserGame` context hook, and `usePhaserEvent` for subscribing to Phaser events
- **React Three Fiber integration** — `<Stage>` component and `useGameLoop` hook for frame-synced game logic
- **Shared event bus** — `LaserEventBus` for decoupled communication between Phaser and R3F layers
- **TypeScript-first** — Full type definitions with exported types for configs, events, and geometry primitives

## Install

```bash
npm install @kbve/laser
```

### Peer Dependencies

Laser requires the following peer dependencies (install the ones you need):

- `react` >= 18.0.0
- `react-dom` >= 18.0.0
- `phaser` >= 3.80.0 _(optional — only needed for Phaser features)_
- `three` >= 0.160.0 _(optional — only needed for R3F features)_
- `@react-three/fiber` >= 9.0.0 _(optional)_
- `@react-three/drei` >= 10.0.0 _(optional)_

## Usage

```tsx
import {
	PhaserGame,
	usePhaserEvent,
	Stage,
	useGameLoop,
	laserEvents,
} from '@kbve/laser';
```

### Support

For questions or help, reach out via our [Discord server](https://kbve.com/discord/).

[![Discord](https://img.shields.io/discord/342732838598082562?logo=discord)](https://kbve.com/discord/)

## License

MIT
