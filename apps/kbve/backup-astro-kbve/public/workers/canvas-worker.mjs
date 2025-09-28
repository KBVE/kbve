import { e as c } from "../comlink-CC72iIUO.js";
const n = {
  bindings: /* @__PURE__ */ new Map(),
  async bindCanvas(a, t, e = "animated") {
    const s = t.getContext("2d");
    if (!s) {
      console.error(`[CanvasWorker] Failed to get 2D context for panel ${a}`);
      return;
    }
    console.log(`[CanvasWorker] Successfully bound canvas for panel ${a} with mode ${e}`), this.bindings.set(a, { ctx: s, canvas: t, panelId: a, mode: e }), this.startAnimation(a);
  },
  startAnimation(a) {
    const t = this.bindings.get(a);
    if (t)
      switch (t.mode) {
        case "static":
          this.drawStatic(t);
          break;
        case "animated":
          this.drawAnimated(t);
          break;
        case "dynamic":
          this.drawDynamic(t);
          break;
        default:
          console.warn(`[CanvasWorker] Unknown draw mode for panel ${a}`);
      }
  },
  drawStatic(a) {
    a.ctx.fillStyle = "gray", a.ctx.fillRect(0, 0, a.canvas.width, a.canvas.height);
  },
  drawAnimated(a) {
    let t = 0;
    const e = () => {
      t = (t + 1) % 360, a.ctx.fillStyle = `hsl(${t}, 100%, 50%)`, a.ctx.fillRect(0, 0, a.canvas.width, a.canvas.height), a.animationFrame = requestAnimationFrame(e);
    };
    e();
  },
  drawDynamic(a) {
    let t = 0;
    const e = () => {
      t += 0.05, a.ctx.clearRect(0, 0, a.canvas.width, a.canvas.height), a.ctx.beginPath(), a.ctx.arc(
        a.canvas.width / 2 + Math.sin(t) * 50,
        a.canvas.height / 2 + Math.cos(t) * 50,
        30,
        0,
        Math.PI * 2
      ), a.ctx.fillStyle = "orange", a.ctx.fill(), a.animationFrame = requestAnimationFrame(e);
    };
    e();
  },
  async unbindCanvas(a) {
    const t = this.bindings.get(a);
    t?.animationFrame && cancelAnimationFrame(t.animationFrame), this.bindings.delete(a), console.log(`[CanvasWorker] Unbound canvas for panel ${a}`);
  }
};
c(n);
