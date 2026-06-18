# @kbve/chat — IRC chat-envelope codec

Shared codec for the structured envelope that KBVE game-server bots and chat
clients embed inside IRC `PRIVMSG`/`NOTICE` text. Proto is the single source of
truth (`packages/data/proto/kbve/chat.proto` → `kbve.chat`); the generated Zod
schema is consumed here via `@kbve/proto/chat-schema`, and the Rust producer
(`bevy_chat`) speaks the same wire form from the same proto.

## Wire format

```
[KIND] sender@platform: content {optional-json-payload}
```

When carried over IRC the body sits in the trailing parameter:

```
PRIVMSG #world-events :[EVENT:KILL] Hero@discord: Hero slew the Glass Golem {"target":"Glass Golem","xp":100}
```

### `[KIND]` token

The token is derived from the `ChatKind` proto enum name by one rule, shared by
every producer/consumer — never hand-list tags:

1. strip the `CHAT_KIND_` prefix,
2. rewrite a leading `EVENT_` to `EVENT:`.

| ChatKind                         | Wire tag               |
| -------------------------------- | ---------------------- |
| `CHAT_KIND_CHAT`                 | `CHAT`                 |
| `CHAT_KIND_SYSTEM`               | `SYSTEM`               |
| `CHAT_KIND_JOIN`                 | `JOIN`                 |
| `CHAT_KIND_PART`                 | `PART`                 |
| `CHAT_KIND_NOTICE`               | `NOTICE`               |
| `CHAT_KIND_EVENT_KILL`           | `EVENT:KILL`           |
| `CHAT_KIND_EVENT_RARE_DROP`      | `EVENT:RARE_DROP`      |
| `CHAT_KIND_EVENT_CAPTURE`        | `EVENT:CAPTURE`        |
| `CHAT_KIND_EVENT_QUEST_COMPLETE` | `EVENT:QUEST_COMPLETE` |
| `CHAT_KIND_EVENT_AREA_UNLOCKED`  | `EVENT:AREA_UNLOCKED`  |
| `CHAT_KIND_EVENT_DEATH`          | `EVENT:DEATH`          |
| `CHAT_KIND_EVENT_CRAFT`          | `EVENT:CRAFT`          |
| `CHAT_KIND_CUSTOM`               | `EVENT:<custom_kind>`  |

`platform` is the `Platform` enum name with `PLATFORM_` stripped, lowercased
(`PLATFORM_NEXUS_DEFENSE` → `nexus_defense`).

Adding a kind is a one-place change: add the enum value in `chat.proto`, run
`nx run data-proto:generate-zod`, and both the TS codec and Rust `bevy_chat`
pick it up — no edits to parser code.

## Producer rules

- **512-byte line limit.** RFC2812 caps a full IRC line (including `\r\n`) at
  512 bytes. `toIrcLine()` enforces it producer-side: it drops the payload
  first, then truncates `content`. Never emit an envelope past the cap.
- **Payload is JSON, UTF-8, object-shaped.** It must be a single JSON object
  (`{...}`). Numbers round-trip through `google.protobuf.Struct` as `f64`, so do
  not rely on integer/float distinction across the boundary. Arrays/scalars at
  the top level are rejected.
- **No spaces before the first `{` inside content.** The parser splits the
  payload at the first ` {`; brace-bearing prose stays as content only when the
  tail is not valid JSON. Keep large or free-form blobs out of `content`.
- **Custom events.** Set `kind = CHAT_KIND_CUSTOM` and put the label in
  `custom_kind`; it is emitted as `EVENT:<label>` and round-trips back.

## NOTICE

IRC `NOTICE` lines map to `CHAT_KIND_NOTICE`. The chat embed surfaces them as a
first-class message (`type: 'notice'`) instead of dropping them; the renderer
styles them muted-italic.

## API

```ts
import {
	parseEnvelope,
	formatEnvelope,
	toIrcLine,
	chatEnvelope,
	noticeEnvelope,
	ChatKind,
	Platform,
} from '@kbve/chat';

const env = chatEnvelope(
	ChatKind.CHAT_KIND_EVENT_KILL,
	'Hero',
	Platform.PLATFORM_DISCORD,
	'#world-events',
	'Hero slew the Glass Golem',
	{ target: 'Glass Golem', xp: 100 },
);

const line = toIrcLine(env); // full PRIVMSG line, 512-byte-clamped
const body = formatEnvelope(env); // just the [KIND] sender@platform: ... body
const back = parseEnvelope(body, { channel: '#world-events' }); // ChatEnvelope | null
```

`parseEnvelope` returns `null` for plain IRC chatter (no `[KIND]` wrapper) so the
caller can fall back to a plain chat message.
