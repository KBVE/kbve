import { e as c } from "../comlink-CC72iIUO.js";
let e = null, s = null;
const a = {
  async connect(o) {
    e || (e = new WebSocket(o), e.binaryType = "arraybuffer", e.onopen = () => console.log("[WS] Connected:", o), e.onmessage = (n) => {
      try {
        console.log("[WS] Received binary message"), n.data instanceof ArrayBuffer && s?.(n.data);
      } catch (r) {
        console.error("[WS] Failed to forward message", r);
      }
    }, e.onerror = (n) => console.error("[WS] Error:", n), e.onclose = () => {
      console.log("[WS] Disconnected"), e = null;
    });
  },
  async send(o) {
    e?.readyState === WebSocket.OPEN ? e.send(o) : console.warn("[WS] Tried to send while disconnected");
  },
  async close() {
    e?.close(), e = null;
  },
  onMessage(o) {
    s = o;
  }
};
self.onconnect = (o) => {
  const n = o.ports[0];
  n.start(), c(a, n);
};
