# Supabase Realtime Component

Off-thread realtime Supabase connection using Web Workers and SharedWorkers for optimal performance.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Main Thread (UI)                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  AstroRealtimeContainer.astro                        │  │
│  │    └─> ReactSupaRealtime.tsx (React Component)      │  │
│  │          - UI Rendering                              │  │
│  │          - State Management                          │  │
│  │          - Event Handling                            │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Realtime.worker.ts (Web Worker)                     │  │
│  │    - Data Processing                                 │  │
│  │    - Event Transformation                            │  │
│  │    - OffscreenCanvas Rendering                       │  │
│  └──────────────────────────────────────────────────────┘  │
│                           ↕                                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  SupaShared (SharedWorker Connection)                │  │
│  │    - Supabase Client                                 │  │
│  │    - Realtime Subscriptions                          │  │
│  │    - Connection Management                           │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Files

- **`AstroRealtimeContainer.astro`**: Astro wrapper component with styling
- **`ReactSupaRealtime.tsx`**: React component with hooks and state management
- **`Realtime.worker.ts`**: Web Worker for off-thread data processing
- **`typeRealtime.ts`**: TypeScript type definitions
- **`index.ts`**: Barrel exports

## Usage

### Basic Usage in Astro

```astro
---
import { AstroRealtimeContainer } from '@/components/realtime/AstroRealtimeContainer.astro';
---

<AstroRealtimeContainer
	showStatusIndicator={true}
	width="100%"
	height="400px"
/>
```

### With Initial Subscriptions

```astro
---
import { AstroRealtimeContainer } from '@/components/realtime/AstroRealtimeContainer.astro';

const subscriptions = [
	{
		id: 'game-events',
		channel: 'game-events',
		schema: 'public',
		table: 'game_events',
		event: '*',
	},
	{
		id: 'player-updates',
		channel: 'player-updates',
		schema: 'public',
		table: 'players',
		event: 'UPDATE',
	},
];
---

<AstroRealtimeContainer
	initialSubscriptions={subscriptions}
	showStatusIndicator={true}
	enableOffscreenCanvas={false}
/>
```

### Using React Component Directly

```tsx
import { ReactSupaRealtime } from '@/components/realtime';
import type { RealtimeEvent } from '@/components/realtime';

function MyComponent() {
	const handleRealtimeEvent = (event: RealtimeEvent) => {
		console.log('Received event:', event.type, event.payload);
	};

	const handleStatusChange = (status: RealtimeStatus) => {
		console.log('Status changed:', status);
	};

	return (
		<ReactSupaRealtime
			showStatusIndicator={true}
			onRealtimeEvent={handleRealtimeEvent}
			onStatusChange={handleStatusChange}
			initialSubscriptions={[
				{
					id: 'my-subscription',
					channel: 'my-channel',
					schema: 'public',
					table: 'my_table',
					event: 'INSERT',
				},
			]}
		/>
	);
}
```

### Dynamic Subscriptions

```tsx
import { useState, useRef } from 'react';
import { ReactSupaRealtime } from '@/components/realtime';

function DynamicSubscriptions() {
	const [subscriptions, setSubscriptions] = useState([]);

	const subscribe = () => {
		const newSub = {
			id: crypto.randomUUID(),
			channel: 'dynamic-channel',
			schema: 'public',
			table: 'events',
			event: 'INSERT',
		};

		setSubscriptions([...subscriptions, newSub]);
	};

	return (
		<div>
			<button onClick={subscribe}>Add Subscription</button>
			<ReactSupaRealtime initialSubscriptions={subscriptions} />
		</div>
	);
}
```

### With OffscreenCanvas Visualization

```astro
---
import { AstroRealtimeContainer } from '@/components/realtime/AstroRealtimeContainer.astro';
---

<AstroRealtimeContainer
	enableOffscreenCanvas={true}
	canvasId="realtime-viz"
	width="800px"
	height="600px"
	showStatusIndicator={true}
/>
```

## Props

### AstroRealtimeContainer Props

| Prop                    | Type                    | Default             | Description                  |
| ----------------------- | ----------------------- | ------------------- | ---------------------------- |
| `className`             | `string`                | `''`                | CSS class name               |
| `width`                 | `string`                | `'100%'`            | Container width              |
| `height`                | `string`                | `'400px'`           | Container height             |
| `backgroundColor`       | `string`                | `'transparent'`     | Background color             |
| `initialSubscriptions`  | `ChannelSubscription[]` | `[]`                | Initial subscriptions        |
| `enableOffscreenCanvas` | `boolean`               | `false`             | Enable canvas rendering      |
| `canvasId`              | `string`                | `'realtime-canvas'` | Canvas element ID            |
| `showStatusIndicator`   | `boolean`               | `true`              | Show status indicator        |
| `autoReconnect`         | `boolean`               | `true`              | Auto-reconnect on disconnect |
| `reconnectDelay`        | `number`                | `5000`              | Reconnection delay (ms)      |

### ChannelSubscription Type

```typescript
interface ChannelSubscription {
	id: string; // Unique identifier
	channel: string; // Channel name/topic
	schema?: string; // Database schema (default: 'public')
	table?: string; // Database table
	event?: string; // Event type ('INSERT' | 'UPDATE' | 'DELETE' | '*')
	filter?: string; // Filter expression
	subscriptionType?: string; // 'postgres_changes' | 'broadcast' | 'presence'
}
```

## Events

### RealtimeEventType

- `INSERT` - New record inserted
- `UPDATE` - Record updated
- `DELETE` - Record deleted
- `SYSTEM` - System event
- `PRESENCE` - Presence event
- `BROADCAST` - Broadcast event
- `CUSTOM` - Custom event

### RealtimeEvent Structure

```typescript
interface RealtimeEvent<T = any> {
	type: RealtimeEventType; // Event type
	payload: PostgresChangePayload<T> | T; // Event data
	timestamp: number; // Timestamp
	channelId: string; // Channel ID
}
```

## Connection Status

- `DISCONNECTED` - Not connected
- `CONNECTING` - Establishing connection
- `CONNECTED` - Connected and active
- `ERROR` - Connection error
- `RECONNECTING` - Attempting to reconnect

## Features

### Off-Thread Processing

- **Web Worker**: Handles data processing and transformation off the main thread
- **SharedWorker**: Manages actual Supabase connections, shared across browser tabs
- **No UI Blocking**: Realtime data processing doesn't block UI rendering

### OffscreenCanvas Support

- **Hardware Accelerated**: Rendering happens off the main thread
- **Customizable**: Override rendering logic in `Realtime.worker.ts`
- **Fallback**: Gracefully degrades if OffscreenCanvas is not supported

### Connection Management

- **Auto-Reconnect**: Automatically reconnects on disconnect
- **Status Tracking**: Real-time connection status updates
- **Error Handling**: Comprehensive error handling and reporting

### Performance

- **Shared Connections**: Single Supabase connection shared across tabs
- **Efficient Updates**: Only subscribed channels receive updates
- **Memory Efficient**: Automatic cleanup on component unmount

## Browser Support

- **Web Workers**: All modern browsers
- **SharedWorker**: Chrome, Edge, Firefox (not Safari)
- **OffscreenCanvas**: Chrome 69+, Edge 79+, Firefox 105+ (not Safari)

## Examples

### Game Events Dashboard

```astro
---
import { AstroRealtimeContainer } from '@/components/realtime/AstroRealtimeContainer.astro';

const gameSubscriptions = [
	{
		id: 'player-spawns',
		channel: 'game-events',
		schema: 'public',
		table: 'game_events',
		event: 'INSERT',
		filter: 'event_type=eq.player_spawn',
	},
	{
		id: 'enemy-kills',
		channel: 'game-events',
		schema: 'public',
		table: 'game_events',
		event: 'INSERT',
		filter: 'event_type=eq.enemy_kill',
	},
];
---

<div class="game-dashboard">
	<h1>Live Game Events</h1>
	<AstroRealtimeContainer
		initialSubscriptions={gameSubscriptions}
		showStatusIndicator={true}
		width="100%"
		height="600px"
		enableOffscreenCanvas={true}
	/>
</div>
```

### Chat Application

```tsx
import { ReactSupaRealtime } from '@/components/realtime';
import { useState } from 'react';

function ChatRoom({ roomId }) {
	const [messages, setMessages] = useState([]);

	const handleMessage = (event) => {
		if (event.type === 'INSERT') {
			setMessages((prev) => [...prev, event.payload.new]);
		}
	};

	return (
		<div>
			<ReactSupaRealtime
				showStatusIndicator={true}
				onRealtimeEvent={handleMessage}
				initialSubscriptions={[
					{
						id: `chat-${roomId}`,
						channel: `chat-${roomId}`,
						schema: 'public',
						table: 'messages',
						event: 'INSERT',
						filter: `room_id=eq.${roomId}`,
					},
				]}
			/>
			<div className="messages">
				{messages.map((msg) => (
					<div key={msg.id}>{msg.content}</div>
				))}
			</div>
		</div>
	);
}
```

## Debugging

Enable debug mode by setting `import.meta.env.DEV` to true. This will show:

- Current connection status
- Number of active subscriptions
- Event count
- Session status
- Last connection time

## Performance Tips

1. **Limit Subscriptions**: Only subscribe to channels you need
2. **Use Filters**: Apply server-side filters to reduce data transfer
3. **Batch Updates**: Process multiple events together when possible
4. **Cleanup**: Always unsubscribe when components unmount
5. **Monitor Status**: Watch connection status and handle errors

## Security

- Uses Supabase Row Level Security (RLS)
- Anonymous key for public data only
- User authentication via SupaProvider
- Secure WebSocket connections (WSS)

## Testing

```bash
# Run type checking
npm run typecheck

# Build and test
npm run build
```

## Troubleshooting

### Worker Not Loading

- Check that worker files are included in build
- Verify Vite configuration supports workers
- Check browser console for worker errors

### Connection Issues

- Verify Supabase URL and anon key
- Check network connectivity
- Verify Supabase project is active
- Check browser console for errors

### SharedWorker Not Supported

- Component falls back to Web Worker only
- Safari doesn't support SharedWorker
- Use feature detection to handle gracefully

## Future Enhancements

- [ ] Presence tracking (show online users)
- [ ] Broadcast messaging
- [ ] Custom canvas visualizations
- [ ] WebRTC integration for P2P
- [ ] Message queuing and replay
- [ ] Advanced filtering and transformations
- [ ] Performance metrics and monitoring

## License

Part of the BugWars project.
