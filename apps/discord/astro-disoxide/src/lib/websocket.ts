import { builder } from 'src/util/flexbuilder';

function addField(b: ReturnType<typeof builder>, key: string, value: string) {
  b.startMap();
    b.addKey('key');
    b.add(key);
    b.addKey('value');
    b.add(value);
  b.end();
}

export function buildXaddPayload(
  stream: string,
  fields: Record<string, string>,
  id: string = '*'
): Uint8Array {
  const b = builder();

  b.startMap();
    b.addKey('xadd');
    b.startMap();
      b.addKey('stream');
      b.add(stream);

      b.addKey('id');
      b.add(id);

      b.addKey('fields');
      b.startVector();
        for (const [key, value] of Object.entries(fields)) {
          addField(b, key, value);
        }
      b.end();
    b.end();
  b.end();

  return b.finish();
}

export function buildXreadPayload(
  streams: { stream: string, id: string }[],
  count?: number,
  block?: number
): Uint8Array {
  const b = builder();

  b.startMap();
    b.addKey('xread');
    b.startMap();

      b.addKey('streams');
      b.startVector();
        for (const { stream, id } of streams) {
          b.startMap();
            b.addKey('stream');
            b.add(stream);
            b.addKey('id');
            b.add(id);
          b.end();
        }
      b.end();

      if (count !== undefined) {
        b.addKey('count');
        b.add(count);
      }

      if (block !== undefined) {
        b.addKey('block');
        b.add(block);
      }

    b.end();
  b.end();

  return b.finish();
}

export function startRedisWebSocketClient(
  wsUrl: string,
  logFn: (msg: string) => void
) {
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => logFn('[WebSocket] Connected');

  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      logFn(`[WebSocket] Binary (${bytes.length} bytes): ${Array.from(bytes).join(', ')}`);
    } else {
      logFn('[WebSocket] Text: ' + event.data);
    }
  };

  ws.onclose = () => logFn('[WebSocket] Disconnected');
  ws.onerror = (e) => logFn('[WebSocket] Error');

  return {
    sendXadd: (stream: string, fields: Record<string, string>, id?: string) => {
      const payload = buildXaddPayload(stream, fields, id);
      ws.send(payload);
      logFn(`[Client] Sent XADD to '${stream}'`);
    },
    sendXread: (
      streams: { stream: string, id: string }[],
      count?: number,
      block?: number
    ) => {
      const payload = buildXreadPayload(streams, count, block);
      ws.send(payload);
      logFn(`[Client] Sent XREAD for ${streams.map(s => s.stream).join(', ')}`);
    }
  };
}
