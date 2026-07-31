import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
	KIND,
	KIND_META,
	RESPAWN_MINUTES,
	Kind,
	Pos,
	createMarkerWorld,
	markerEntities,
	labels,
	iconKeys,
	gameToUnits,
	syncPlayers,
	lerpFrom,
	lerpStart,
	type KindName,
	type LivePlayer,
} from './markerEcs';

const MAX_ZOOM = 8;
const PAL_TILE_BASE = '/palworld/tiles';
const PAL_MAX_NATIVE_ZOOM = 6;
const WT_TILE_BASE = '/palworld/wt-overlay';
const LIVE_URL_DEFAULT = 'https://palworld.kbve.com/live/players';
const LIVE_POLL_MS = 5000;
const LERP_MS = 4000;
const TIMERS_KEY = 'palworld-map-timers';

const KIND_NAMES = Object.keys(KIND) as KindName[];

export function gameToLatLng(gx: number, gy: number): L.LatLngTuple {
	const [x, yd] = gameToUnits(gx, gy);
	return [-yd, x];
}

const loadTimers = (): Record<string, number> => {
	try {
		return JSON.parse(localStorage.getItem(TIMERS_KEY) || '{}');
	} catch {
		return {};
	}
};

const timerKey = (eid: number): string =>
	`${Kind.v[eid]}:${Pos.x[eid].toFixed(2)}:${Pos.yd[eid].toFixed(2)}`;

export default function ReactPalworldMap() {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const palBounds = L.latLngBounds([
			[-256, 0],
			[0, 256],
		]);
		const wtBounds = L.latLngBounds([
			[-0.4, -16.6],
			[60.1, 43.9],
		]);
		const worldBounds = L.latLngBounds([
			[-256, -16.6],
			[60.1, 256],
		]);
		const map = L.map(el, {
			crs: L.CRS.Simple,
			minZoom: 0,
			maxZoom: MAX_ZOOM,
			maxBounds: worldBounds.pad(0.15),
			maxBoundsViscosity: 0.75,
			attributionControl: false,
		});
		map.fitBounds(worldBounds);
		L.tileLayer(`${PAL_TILE_BASE}/{z}/{x}/{y}.webp`, {
			tileSize: 256,
			minZoom: 0,
			maxZoom: MAX_ZOOM,
			maxNativeZoom: PAL_MAX_NATIVE_ZOOM,
			noWrap: true,
			bounds: palBounds,
			keepBuffer: 4,
			updateWhenIdle: false,
		}).addTo(map);
		L.tileLayer(`${WT_TILE_BASE}/{z}/{x}/{y}.webp`, {
			tileSize: 256,
			minZoom: 0,
			maxZoom: MAX_ZOOM,
			maxNativeZoom: MAX_ZOOM,
			noWrap: true,
			bounds: wtBounds,
			keepBuffer: 4,
			updateWhenIdle: false,
		}).addTo(map);

		const world = createMarkerWorld();
		const bossEnts = markerEntities(world).filter(
			(eid) => Kind.v[eid] === KIND.boss,
		);
		const serverTimers = new Map<number, number>();
		const visible = new Set<number>(Object.values(KIND));
		const timers = loadTimers();
		const saveTimers = () =>
			localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
		const images = new Map<string, HTMLImageElement>();
		const loadImage = (src: string) => {
			if (images.has(src)) return images.get(src)!;
			const img = new Image();
			img.src = src;
			img.onload = () => scheduleDraw();
			images.set(src, img);
			return img;
		};
		for (const meta of Object.values(KIND_META))
			if (meta.icon) loadImage(meta.icon);

		const canvas = document.createElement('canvas');
		canvas.style.cssText =
			'position:absolute;z-index:450;pointer-events:none';
		map.getPane('overlayPane')!.appendChild(canvas);
		const ctx = canvas.getContext('2d')!;

		const tooltip = document.createElement('div');
		tooltip.style.cssText =
			'position:absolute;z-index:700;pointer-events:none;display:none;' +
			'background:rgba(8,14,24,0.92);color:#e8f0fa;font:12px/1.4 system-ui,sans-serif;' +
			'padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);' +
			'white-space:nowrap;transform:translate(-50%,-130%)';
		el.appendChild(tooltip);

		let rafId = 0;
		const scheduleDraw = () => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				draw();
			});
		};

		const screenXY = (() => {
			let ax = 0,
				bx = 0,
				ay = 0,
				by = 0;
			const refresh = () => {
				const p0 = map.latLngToContainerPoint([0, 0]);
				const p1 = map.latLngToContainerPoint([-1, 1]);
				bx = p0.x;
				by = p0.y;
				ax = p1.x - p0.x;
				ay = p1.y - p0.y;
			};
			return {
				refresh,
				x: (u: number) => bx + u * ax,
				y: (u: number) => by + u * ay,
			};
		})();

		const fmtRemain = (ms: number): string => {
			const s = Math.max(0, Math.ceil(ms / 1000));
			return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
		};

		const entPos = (eid: number, now: number): [number, number] => {
			if (Kind.v[eid] !== KIND.player) return [Pos.x[eid], Pos.yd[eid]];
			const t = Math.min(1, (now - (lerpStart[eid] || 0)) / LERP_MS);
			return [
				lerpFrom.x[eid] + (Pos.x[eid] - lerpFrom.x[eid]) * t,
				lerpFrom.yd[eid] + (Pos.yd[eid] - lerpFrom.yd[eid]) * t,
			];
		};

		const drawList: number[] = [];
		const drawPos = new Map<number, [number, number]>();
		const draw = () => {
			const dpr = window.devicePixelRatio || 1;
			const w = el.clientWidth;
			const h = el.clientHeight;
			if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
				canvas.width = w * dpr;
				canvas.height = h * dpr;
				canvas.style.width = `${w}px`;
				canvas.style.height = `${h}px`;
			}
			L.DomUtil.setPosition(
				canvas,
				map.containerPointToLayerPoint([0, 0]),
			);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);
			screenXY.refresh();
			const zoom = map.getZoom();
			const now = performance.now();
			const wallNow = Date.now();
			let animating = false;
			drawList.length = 0;
			drawPos.clear();
			for (const eid of markerEntities(world)) {
				const kind = Kind.v[eid];
				if (!visible.has(kind)) continue;
				const meta = KIND_META[KIND_NAMES[kind]];
				if (zoom < meta.minZoom) continue;
				const [ux, uy] = entPos(eid, now);
				const sx = screenXY.x(ux);
				const sy = screenXY.y(uy);
				if (sx < -60 || sy < -60 || sx > w + 60 || sy > h + 60)
					continue;
				drawList.push(eid);
				drawPos.set(eid, [sx, sy]);
				const size = meta.size;
				if (kind === KIND.player) {
					animating = true;
					ctx.beginPath();
					ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
					ctx.fillStyle = '#4ade80';
					ctx.fill();
					ctx.strokeStyle = '#ffffff';
					ctx.lineWidth = 2;
					ctx.stroke();
					if (zoom >= 3) {
						ctx.font = '600 11px system-ui, sans-serif';
						ctx.textAlign = 'center';
						ctx.fillStyle = '#ffffff';
						ctx.strokeStyle = 'rgba(0,0,0,0.75)';
						ctx.lineWidth = 3;
						const name = labels[eid].split(' · ')[0];
						ctx.strokeText(name, sx, sy - size / 2 - 4);
						ctx.fillText(name, sx, sy - size / 2 - 4);
					}
					continue;
				}
				const src = iconKeys[eid] || meta.icon;
				const img = loadImage(src);
				if (img.complete && img.naturalWidth) {
					if (kind === KIND.boss) {
						ctx.save();
						ctx.beginPath();
						ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
						ctx.fillStyle = '#0b1420';
						ctx.fill();
						ctx.clip();
						ctx.drawImage(
							img,
							sx - size / 2,
							sy - size / 2,
							size,
							size,
						);
						ctx.restore();
						ctx.beginPath();
						ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
						ctx.strokeStyle = 'rgba(255,255,255,0.4)';
						ctx.lineWidth = 1.5;
						ctx.stroke();
					} else {
						ctx.drawImage(
							img,
							sx - size / 2,
							sy - size / 2,
							size,
							size,
						);
					}
				}
				const tk = timerKey(eid);
				const deadline = serverTimers.get(eid) || timers[tk];
				if (deadline) {
					if (deadline <= wallNow) {
						serverTimers.delete(eid);
						if (timers[tk]) {
							delete timers[tk];
							saveTimers();
						}
					} else {
						const txt = fmtRemain(deadline - wallNow);
						ctx.font = '600 10px system-ui, sans-serif';
						ctx.textAlign = 'center';
						const tw = ctx.measureText(txt).width + 8;
						ctx.fillStyle = 'rgba(8,14,24,0.85)';
						ctx.beginPath();
						ctx.roundRect(
							sx - tw / 2,
							sy + size / 2 + 2,
							tw,
							14,
							4,
						);
						ctx.fill();
						ctx.fillStyle = '#fbbf24';
						ctx.fillText(txt, sx, sy + size / 2 + 12.5);
					}
				}
			}
			if (animating) scheduleDraw();
		};

		const nearest = (mx: number, my: number, radius: number): number => {
			let best = -1;
			let bestD = radius * radius;
			for (const eid of drawList) {
				const p = drawPos.get(eid);
				if (!p) continue;
				const dx = p[0] - mx;
				const dy = p[1] - my;
				const d = dx * dx + dy * dy;
				if (d < bestD) {
					bestD = d;
					best = eid;
				}
			}
			return best;
		};

		const onMouseMove = (ev: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const best = nearest(
				ev.clientX - rect.left,
				ev.clientY - rect.top,
				18,
			);
			if (best >= 0) {
				const p = drawPos.get(best)!;
				let text = labels[best];
				const deadline =
					serverTimers.get(best) || timers[timerKey(best)];
				if (deadline && deadline > Date.now())
					text += ` — respawn ${fmtRemain(deadline - Date.now())}`;
				else if (RESPAWN_MINUTES[KIND_NAMES[Kind.v[best]]])
					text += ' — click to start timer';
				tooltip.textContent = text;
				tooltip.style.left = `${p[0]}px`;
				tooltip.style.top = `${p[1]}px`;
				tooltip.style.display = 'block';
			} else {
				tooltip.style.display = 'none';
			}
		};
		let downAt: [number, number] | null = null;
		const onMouseDown = (ev: MouseEvent) => {
			downAt = [ev.clientX, ev.clientY];
		};
		const onClick = (ev: MouseEvent) => {
			if (
				!downAt ||
				Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5
			)
				return;
			const rect = el.getBoundingClientRect();
			const best = nearest(
				ev.clientX - rect.left,
				ev.clientY - rect.top,
				18,
			);
			if (best < 0) return;
			const mins = RESPAWN_MINUTES[KIND_NAMES[Kind.v[best]]];
			if (!mins) return;
			const tk = timerKey(best);
			if (timers[tk]) delete timers[tk];
			else timers[tk] = Date.now() + mins * 60_000;
			saveTimers();
			scheduleDraw();
		};
		el.addEventListener('mousemove', onMouseMove);
		el.addEventListener('mousedown', onMouseDown);
		el.addEventListener('click', onClick);
		el.addEventListener('mouseleave', () => {
			tooltip.style.display = 'none';
		});

		map.on('moveend zoomend viewreset resize', scheduleDraw);
		map.on('movestart zoomstart', () => {
			tooltip.style.display = 'none';
		});
		scheduleDraw();

		const timerTick = setInterval(() => {
			if (Object.keys(timers).length) scheduleDraw();
		}, 1000);

		const countSpans = new Map<number, Text>();
		const control = new L.Control({ position: 'topright' });
		control.onAdd = () => {
			const div = L.DomUtil.create('div', 'pal-map-filters');
			div.style.cssText =
				'background:rgba(8,14,24,0.9);color:#e8f0fa;padding:8px 10px;border-radius:8px;' +
				'border:1px solid rgba(255,255,255,0.15);font:12px/1.7 system-ui,sans-serif';
			L.DomEvent.disableClickPropagation(div);
			const counts = new Map<number, number>();
			for (const eid of markerEntities(world))
				counts.set(Kind.v[eid], (counts.get(Kind.v[eid]) || 0) + 1);
			for (const [name, kind] of Object.entries(KIND)) {
				const meta = KIND_META[name as KindName];
				const row = document.createElement('label');
				row.style.cssText =
					'display:flex;gap:6px;align-items:center;cursor:pointer';
				const cb = document.createElement('input');
				cb.type = 'checkbox';
				cb.checked = true;
				cb.onchange = () => {
					cb.checked ? visible.add(kind) : visible.delete(kind);
					scheduleDraw();
				};
				row.appendChild(cb);
				const txt = document.createTextNode(
					`${meta.plural} (${counts.get(kind) || 0})`,
				);
				countSpans.set(kind, txt);
				row.appendChild(txt);
				div.appendChild(row);
			}
			return div;
		};
		control.addTo(map);

		const liveUrl =
			new URLSearchParams(window.location.search).get('live') ||
			LIVE_URL_DEFAULT;
		let stopped = false;
		const poll = async () => {
			try {
				const res = await fetch(liveUrl, { cache: 'no-store' });
				if (!res.ok) throw new Error(String(res.status));
				const data = (await res.json()) as {
					players?: LivePlayer[];
					bosses?: {
						id: string;
						x: number;
						y: number;
						respawn_at: number;
					}[];
				};
				if (stopped) return;
				syncPlayers(world, data.players || [], performance.now());
				serverTimers.clear();
				for (const b of data.bosses || []) {
					const [ux, uy] = gameToUnits(b.x, b.y);
					let bestEid = -1;
					let bestD = 9;
					for (const eid of bossEnts) {
						const dx = Pos.x[eid] - ux;
						const dy = Pos.yd[eid] - uy;
						const d = dx * dx + dy * dy;
						if (d < bestD) {
							bestD = d;
							bestEid = eid;
						}
					}
					if (bestEid >= 0)
						serverTimers.set(bestEid, b.respawn_at);
				}
				const span = countSpans.get(KIND.player);
				if (span)
					span.textContent = `Players (${data.players?.length || 0})`;
				scheduleDraw();
			} catch {
				if (stopped) return;
				syncPlayers(world, [], performance.now());
				const span = countSpans.get(KIND.player);
				if (span) span.textContent = 'Players (offline)';
			}
		};
		poll();
		const pollTimer = setInterval(poll, LIVE_POLL_MS);

		return () => {
			stopped = true;
			clearInterval(pollTimer);
			clearInterval(timerTick);
			el.removeEventListener('mousemove', onMouseMove);
			el.removeEventListener('mousedown', onMouseDown);
			el.removeEventListener('click', onClick);
			map.remove();
			canvas.remove();
			tooltip.remove();
		};
	}, []);

	return (
		<div
			ref={containerRef}
			style={{
				width: '100%',
				height: '100%',
				minHeight: '70vh',
				background: '#0b1420',
				borderRadius: '0.75rem',
				position: 'relative',
			}}
		/>
	);
}
