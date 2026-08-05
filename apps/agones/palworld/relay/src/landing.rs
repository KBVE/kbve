pub const LANDING_HTML: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KBVE Palworld — Live Server</title>
<meta name="description" content="Live status for the KBVE Palworld dedicated server — players online, boss timers, world events, and guild bases.">
<style>
:root{--bg:#080e18;--card:#0d1524;--line:rgba(255,255,255,.08);--fg:#e8f0fa;--dim:#8b9bb0;--accent:#34d399;--accent2:#38bdf8}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:3rem 1rem}
main{width:100%;max-width:52rem}
.eyebrow{font-size:.75rem;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
h1{font-size:2.2rem;line-height:1.15;margin:.4rem 0 .6rem}
h1 span{background:linear-gradient(90deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
.lede{color:var(--dim);max-width:38rem}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:14px;overflow:hidden;margin:2rem 0}
.cell{background:var(--card);padding:1.1rem 1.25rem}
.cell b{display:block;font-size:1.6rem;font-variant-numeric:tabular-nums}
.cell span{font-size:.8rem;color:var(--dim)}
.live{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;background:var(--accent);margin-right:.45rem;animation:pulse 2s infinite}
@keyframes pulse{50%{opacity:.35}}
.links{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
.btn{display:inline-block;padding:.6rem 1.1rem;border-radius:10px;border:1px solid var(--line);color:var(--fg);text-decoration:none;font-size:.9rem}
.btn--primary{background:linear-gradient(90deg,var(--accent),var(--accent2));color:#04121c;border:0;font-weight:600}
.btn:hover{border-color:var(--accent)}
footer{margin-top:auto;padding-top:3rem;color:var(--dim);font-size:.8rem}
footer a{color:var(--dim)}
code{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:.1rem .4rem;font-size:.85em}
</style>
</head>
<body>
<main>
<p class="eyebrow"><span class="live"></span>Live server</p>
<h1>KBVE <span>Palworld</span></h1>
<p class="lede">An Agones-managed dedicated Palworld world on Kubernetes. This endpoint publishes the live telemetry that powers the interactive map — players, alpha boss respawns, world events, and guild bases parsed straight from the world save.</p>
<div class="grid">
<div class="cell"><b id="players">–</b><span>Players online</span></div>
<div class="cell"><b id="uptime">–</b><span>Uptime</span></div>
<div class="cell"><b id="fps">–</b><span>Server FPS</span></div>
<div class="cell"><b id="bases">–</b><span>Guild bases</span></div>
</div>
<div class="links">
<a class="btn btn--primary" href="https://kbve.com/palworld/map/">Interactive map</a>
<a class="btn" href="https://kbve.com/palworld/">How to join</a>
<a class="btn" href="/live/players">/live/players</a>
<a class="btn" href="/live/bases">/live/bases</a>
<a class="btn" href="/live/events">/live/events</a>
</div>
</main>
<footer>Run by <a href="https://kbve.com">KBVE</a> · telemetry is read-only and anonymous beyond in-game names</footer>
<script>
const fmt=(s)=>{const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+"h "+m+"m":m+"m"};
async function tick(){
try{const d=await (await fetch('/live/players',{cache:'no-store'})).json();
document.getElementById('players').textContent=d.player_count??0;
document.getElementById('uptime').textContent=fmt(d.uptime_s??0);
document.getElementById('fps').textContent=d.fps??'–';}catch{}
try{const b=await (await fetch('/live/bases',{cache:'no-store'})).json();
document.getElementById('bases').textContent=b.base_count??0;}catch{}
}
tick();setInterval(tick,10000);
</script>
</body>
</html>"#;
