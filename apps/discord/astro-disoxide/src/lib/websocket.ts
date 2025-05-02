// src/lib/websocket.ts
import { builder } from 'src/util/flexbuilder';
import { toReference } from 'src/util/flexbuilder';

export function inspectFlex(buffer: Uint8Array): void {
    const obj = toReference(new Uint8Array(buffer).buffer as ArrayBuffer).toObject();
    console.log('FlexObject:', JSON.stringify(obj, null, 2));
}

type FieldMap = Record<string, string>;
type StreamRequest = { stream: string; id: string };

export function buildXaddPayload(
    stream: string,
    fields: FieldMap,
    id: string = '*'
  ): Uint8Array {
    const b = builder();
  
    b.startMap();
      b.addKey('xadd');
      b.add({
        stream,
        id,
        fields: Object.entries(fields).map(([k, v]) => ({ key: k, value: v })),
      });
    b.end();
  
    const buf = b.finish();
    inspectFlex(buf);
    return buf;
  }

export function buildXreadPayload(
  streams: StreamRequest[],
  count?: number,
  block?: number
): Uint8Array {
  const b = builder();

  b.startMap();
    b.addKey('xread');
    b.add({
      streams,
      ...(count !== undefined && { count }),
      ...(block !== undefined && { block })
    });
  b.end();

  const buf = b.finish();
  inspectFlex(buf);
  return buf;
}

export function startRedisWebSocketClient(
  wsUrl: string,
  logFn: (msg: string) => void
) {
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';

  ws.onopen = () => logFn('[WebSocket] Connected v0.2');
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      const bytes = new Uint8Array(event.data);
      logFn(`[WebSocket] Binary (${bytes.length} bytes): ${Array.from(bytes).join(', ')}`);
    } else {
      logFn('[WebSocket] Text: ' + event.data);
    }
  };
  ws.onclose = () => logFn('[WebSocket] Disconnected');
  ws.onerror = () => logFn('[WebSocket] Error');

  return {
    sendXadd: (stream: string, fields: FieldMap, id = '*') => {
      const payload = buildXaddPayload(stream, fields, id);
      ws.send(payload);
      logFn(`[Client] Sent XADD to '${stream}'`);
    },
    sendXread: (streams: StreamRequest[], count?: number, block?: number) => {
      const payload = buildXreadPayload(streams, count, block);
      ws.send(payload);
      logFn(`[Client] Sent XREAD for ${streams.map(s => s.stream).join(', ')}`);
    }
  };
}
