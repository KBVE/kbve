import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DroidEvents } from '@kbve/droid';
import { startLivePoller, type LiveSnapshot } from './livePoller';
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
	type KindName,
} from './markerEcs';

const MAX_ZOOM = 8;
const PAL_TILE_BASE = '/palworld/tiles';
const PAL_MAX_NATIVE_ZOOM = 6;
const WT_TILE_BASE = '/palworld/wt-overlay';
const LIVE_URL_DEFAULT = 'https://palworld.kbve.com/live/players';
const LERP_MS = 4000;
const TIMERS_KEY = 'palworld-map-timers';
const PAD = 0.5;

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

const esc = (s: string) =>
	s.replace(
		/[&<>"']/g,
		(c) =>
			({
				'&': '&amp;',
				'<': '&lt;',
				'>': '&gt;',
				'"': '&quot;',
				"'": '&#39;',
			})[c]!,
	);

const fmtRemain = (ms: number): string => {
	const s = Math.max(0, Math.ceil(ms / 1000));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

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
			zoomSnap: 0,
			zoomDelta: 0.5,
			scrollWheelZoom: false,
			zoomAnimation: false,
			markerZoomAnimation: false,
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
			updateWhenZooming: false,
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
			updateWhenZooming: false,
		}).addTo(map);

		map.createPane('palpois');
		const pane = map.getPane('palpois')!;
		pane.style.zIndex = '450';
		const canvas = document.createElement('canvas');
		canvas.style.cssText =
			'position:absolute;left:0;top:0;pointer-events:none;transform-origin:0 0';
		pane.appendChild(canvas);
		const ctx = canvas.getContext('2d')!;

		const world = createMarkerWorld();
		const poiEnts = markerEntities(world).filter(
			(eid) => Kind.v[eid] !== KIND.player,
		);
		const bossEnts = poiEnts.filter((eid) => Kind.v[eid] === KIND.boss);
		const latlngs = new Map<number, L.LatLng>();
		for (const eid of poiEnts)
			latlngs.set(eid, L.latLng(-Pos.yd[eid], Pos.x[eid]));

		const timers = loadTimers();
		const saveTimers = () =>
			localStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
		const serverTimers = new Map<number, number>();

		const cooldownOf = (eid: number): number | undefined => {
			const now = Date.now();
			const st = serverTimers.get(eid);
			if (st && st > now) return st;
			if (st) serverTimers.delete(eid);
			const tk = timerKey(eid);
			const lt = timers[tk];
			if (lt && lt > now) return lt;
			if (lt) {
				delete timers[tk];
				saveTimers();
			}
			return undefined;
		};

		const images = new Map<string, HTMLImageElement>();
		const loadImage = (src: string) => {
			if (images.has(src)) return images.get(src)!;
			const img = new Image();
			img.src = src;
			img.onload = () => scheduleRedraw();
			images.set(src, img);
			return img;
		};
		for (const meta of Object.values(KIND_META))
			if (meta.icon) loadImage(meta.icon);

		const iconScale = (z: number): number =>
			Math.min(1, Math.max(0.45, Math.pow(2, (z - 4) * 0.35)));

		const sprites = new Map<string, HTMLCanvasElement>();
		const spriteFor = (
			src: string,
			sizePx: number,
			boss: boolean,
			cool: boolean,
			dpr: number,
		): HTMLCanvasElement | null => {
			const s = Math.max(4, Math.round(sizePx));
			const key = `${src}|${s}|${boss ? 1 : 0}|${cool ? 1 : 0}`;
			const cached = sprites.get(key);
			if (cached) return cached;
			const img = loadImage(src);
			if (!img.complete || !img.naturalWidth) return null;
			if (sprites.size > 600) sprites.clear();
			const c = document.createElement('canvas');
			c.width = Math.ceil(s * dpr);
			c.height = Math.ceil(s * dpr);
			const g = c.getContext('2d')!;
			g.scale(dpr, dpr);
			g.imageSmoothingQuality = 'high';
			if (cool) g.filter = 'grayscale(85%) brightness(0.75)';
			if (boss) {
				g.save();
				g.beginPath();
				g.arc(s / 2, s / 2, s / 2 - 0.75, 0, Math.PI * 2);
				g.fillStyle = '#0b1420';
				g.fill();
				g.clip();
				g.drawImage(img, 0, 0, s, s);
				g.restore();
				if (cool) g.filter = 'grayscale(85%) brightness(0.75)';
				g.beginPath();
				g.arc(s / 2, s / 2, s / 2 - 0.75, 0, Math.PI * 2);
				g.strokeStyle = 'rgba(255,255,255,0.4)';
				g.lineWidth = 1.5;
				g.stroke();
			} else {
				g.drawImage(img, 0, 0, s, s);
			}
			sprites.set(key, c);
			return c;
		};

		const kindVisible = new Set<number>(Object.values(KIND));
		const drawList: number[] = [];
		const drawPos = new Map<number, [number, number]>();
		let wheelActive = false;
		let settleP0 = map.getPixelOrigin().clone();
		let originX = 0;
		let originY = 0;

		let redrawCount = 0;
		const redraw = () => {
			redrawCount++;
			const dpr = window.devicePixelRatio || 1;
			const w = el.clientWidth;
			const h = el.clientHeight;
			const cw = Math.ceil(w * (1 + 2 * PAD));
			const ch = Math.ceil(h * (1 + 2 * PAD));
			if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
				canvas.width = cw * dpr;
				canvas.height = ch * dpr;
				canvas.style.width = `${cw}px`;
				canvas.style.height = `${ch}px`;
			}
			ctx.setTransform(dpr, 0, 0, dpr, -originX * dpr, -originY * dpr);
			ctx.clearRect(originX, originY, cw, ch);
			const z = map.getZoom();
			const P = map.getPixelOrigin();
			const p0 = map.project(L.latLng(0, 0), z).subtract(P);
			const p1 = map.project(L.latLng(-1, 1), z).subtract(P);
			const ax = p1.x - p0.x;
			const ay = p1.y - p0.y;
			const sizeMult = iconScale(z);
			const wallNow = Date.now();
			const minX = originX - 40;
			const maxX = originX + cw + 40;
			const minY = originY - 40;
			const maxY = originY + ch + 40;
			drawList.length = 0;
			drawPos.clear();
			for (const eid of poiEnts) {
				const kind = Kind.v[eid];
				if (!kindVisible.has(kind)) continue;
				const lx = p0.x + Pos.x[eid] * ax;
				const ly = p0.y + Pos.yd[eid] * ay;
				if (lx < minX || lx > maxX || ly < minY || ly > maxY) continue;
				drawList.push(eid);
				drawPos.set(eid, [lx, ly]);
				const meta = KIND_META[KIND_NAMES[kind]];
				const size = meta.size * sizeMult;
				const deadline = cooldownOf(eid);
				const src = iconKeys[eid] || meta.icon;
				const sp = spriteFor(
					src,
					size,
					kind === KIND.boss,
					!!deadline,
					dpr,
				);
				if (sp)
					ctx.drawImage(sp, lx - size / 2, ly - size / 2, size, size);
				if (deadline) {
					const total =
						(RESPAWN_MINUTES[KIND_NAMES[kind]] || 60) * 60_000;
					const frac = Math.min(
						1,
						Math.max(0, (deadline - wallNow) / total),
					);
					const r = size / 2 + 3.5;
					ctx.beginPath();
					ctx.arc(lx, ly, r, 0, Math.PI * 2);
					ctx.strokeStyle = 'rgba(8,14,24,0.7)';
					ctx.lineWidth = 3;
					ctx.stroke();
					ctx.beginPath();
					ctx.arc(
						lx,
						ly,
						r,
						-Math.PI / 2,
						-Math.PI / 2 + Math.PI * 2 * frac,
					);
					ctx.strokeStyle = '#fbbf24';
					ctx.lineWidth = 3;
					ctx.lineCap = 'round';
					ctx.stroke();
				}
			}
		};

		let redrawRaf = 0;
		const scheduleRedraw = () => {
			if (redrawRaf || wheelActive) return;
			redrawRaf = requestAnimationFrame(() => {
				redrawRaf = 0;
				redraw();
			});
		};

		let settledZoom = NaN;
		const settle = (force = true) => {
			const w = el.clientWidth;
			const h = el.clientHeight;
			if (!force && map.getZoom() === settledZoom) {
				const tl = map.containerPointToLayerPoint([0, 0]);
				const slackX = w * (PAD - 0.15);
				const slackY = h * (PAD - 0.15);
				if (
					Math.abs(tl.x - originX - w * PAD) <= slackX &&
					Math.abs(tl.y - originY - h * PAD) <= slackY
				) {
					return;
				}
			}
			L.DomUtil.setTransform(pane, L.point(0, 0), 1);
			settleP0 = map.getPixelOrigin().clone();
			settledZoom = map.getZoom();
			const o = map.containerPointToLayerPoint([-w * PAD, -h * PAD]);
			originX = o.x;
			originY = o.y;
			L.DomUtil.setPosition(canvas, o);
			redraw();
		};
		map.on('moveend', () => settle(false));
		map.on('zoomend viewreset resize', () => settle(true));
		map.on('zoom', () => {
			if (!wheelActive) settle(true);
		});
		settle();

		const mapInternal = map as unknown as {
			_moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
			_move(center: L.LatLng, zoom: number): void;
			_moveEnd(zoomChanged: boolean): void;
		};
		let wheelGoal = 0;
		let wheelRaf = 0;
		let wheelEndTimer = 0;
		let wheelAnchorPt: L.Point | null = null;
		let wheelAnchorLL: L.LatLng | null = null;
		let wheelStartZoom = 0;
		const wheelFrame = () => {
			wheelRaf = 0;
			if (!wheelActive || !wheelAnchorPt || !wheelAnchorLL) return;
			const cur = map.getZoom();
			let z = cur + (wheelGoal - cur) * 0.3;
			if (Math.abs(wheelGoal - z) < 0.005) z = wheelGoal;
			const half = map.getSize().divideBy(2);
			const center = map.unproject(
				map.project(wheelAnchorLL, z).subtract(wheelAnchorPt).add(half),
				z,
			);
			mapInternal._move(center, z);
			const s = map.getZoomScale(z, wheelStartZoom);
			const t = settleP0.multiplyBy(s).subtract(map.getPixelOrigin());
			L.DomUtil.setTransform(pane, t, s);
			if (z !== wheelGoal) wheelRaf = requestAnimationFrame(wheelFrame);
		};
		const endWheel = () => {
			if (!wheelActive) return;
			if (wheelRaf) {
				wheelEndTimer = window.setTimeout(endWheel, 100);
				return;
			}
			wheelActive = false;
			mapInternal._moveEnd(true);
		};
		const onWheel = (ev: WheelEvent) => {
			ev.preventDefault();
			const rect = el.getBoundingClientRect();
			wheelAnchorPt = L.point(
				ev.clientX - rect.left,
				ev.clientY - rect.top,
			);
			if (!wheelActive) {
				wheelActive = true;
				wheelGoal = map.getZoom();
				wheelStartZoom = wheelGoal;
				mapInternal._moveStart(true, false);
			}
			wheelAnchorLL = map.containerPointToLatLng(wheelAnchorPt);
			const step = ev.deltaMode === 1 ? 0.05 : 0.0035;
			wheelGoal = Math.min(
				MAX_ZOOM,
				Math.max(map.getMinZoom(), wheelGoal - ev.deltaY * step),
			);
			if (!wheelRaf) wheelRaf = requestAnimationFrame(wheelFrame);
			window.clearTimeout(wheelEndTimer);
			wheelEndTimer = window.setTimeout(endWheel, 180);
		};
		el.addEventListener('wheel', onWheel, { passive: false });

		const tooltip = document.createElement('div');
		tooltip.style.cssText =
			'position:absolute;z-index:700;pointer-events:none;display:none;' +
			'background:rgba(8,14,24,0.92);color:#e8f0fa;font:12px/1.4 system-ui,sans-serif;' +
			'padding:4px 8px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);' +
			'white-space:nowrap;transform:translate(-50%,-130%)';
		el.appendChild(tooltip);

		const tooltipText = (eid: number): string => {
			let text = labels[eid];
			const deadline = cooldownOf(eid);
			if (deadline)
				text += ` — respawn ${fmtRemain(deadline - Date.now())}`;
			else if (RESPAWN_MINUTES[KIND_NAMES[Kind.v[eid]]])
				text += ' — click to start timer';
			return text;
		};

		const nearest = (lx: number, ly: number, radius: number): number => {
			let best = -1;
			let bestD = radius * radius;
			for (const eid of drawList) {
				const p = drawPos.get(eid);
				if (!p) continue;
				const dx = p[0] - lx;
				const dy = p[1] - ly;
				const d = dx * dx + dy * dy;
				if (d < bestD) {
					bestD = d;
					best = eid;
				}
			}
			return best;
		};

		const onMouseMove = (ev: MouseEvent) => {
			if (wheelActive) return;
			const lp = map.mouseEventToLayerPoint(ev);
			const best = nearest(lp.x, lp.y, 18);
			if (best >= 0) {
				const cp = map.latLngToContainerPoint(latlngs.get(best)!);
				tooltip.textContent = tooltipText(best);
				tooltip.style.left = `${cp.x}px`;
				tooltip.style.top = `${cp.y}px`;
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
			if (wheelActive) return;
			const lp = map.mouseEventToLayerPoint(ev);
			const best = nearest(lp.x, lp.y, 18);
			if (best < 0) return;
			const mins = RESPAWN_MINUTES[KIND_NAMES[Kind.v[best]]];
			if (!mins) return;
			const tk = timerKey(best);
			if (timers[tk]) delete timers[tk];
			else timers[tk] = Date.now() + mins * 60_000;
			saveTimers();
			scheduleRedraw();
		};
		el.addEventListener('mousemove', onMouseMove);
		el.addEventListener('mousedown', onMouseDown);
		el.addEventListener('click', onClick);
		el.addEventListener('mouseleave', () => {
			tooltip.style.display = 'none';
		});
		map.on('movestart zoomstart', () => {
			tooltip.style.display = 'none';
		});

		const cooldownTick = setInterval(() => {
			let any = false;
			for (const eid of drawList) {
				if (serverTimers.get(eid) || timers[timerKey(eid)]) {
					any = true;
					break;
				}
			}
			if (any) scheduleRedraw();
		}, 1000);

		const playerLayer = L.layerGroup().addTo(map);
		const playerMarkers = new Map<
			string,
			{ m: L.Marker; from: L.LatLng; to: L.LatLng; t0: number }
		>();
		let playerRaf = 0;
		const playerFrame = () => {
			playerRaf = 0;
			const now = performance.now();
			let active = false;
			for (const p of playerMarkers.values()) {
				const t = Math.min(1, (now - p.t0) / LERP_MS);
				if (t < 1) active = true;
				p.m.setLatLng([
					p.from.lat + (p.to.lat - p.from.lat) * t,
					p.from.lng + (p.to.lng - p.from.lng) * t,
				]);
			}
			if (active) playerRaf = requestAnimationFrame(playerFrame);
		};
		const playerIcon = (name: string) =>
			L.divIcon({
				className: 'pal-player',
				iconSize: [14, 14],
				iconAnchor: [7, 7],
				html:
					`<div style="position:relative">` +
					`<span style="position:absolute;left:50%;bottom:16px;transform:translateX(-50%);` +
					`font:600 11px system-ui,sans-serif;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,0.9);` +
					`white-space:nowrap;pointer-events:none">${esc(name)}</span>` +
					`<span style="display:block;width:14px;height:14px;border-radius:50%;` +
					`background:#4ade80;border:2px solid #fff;box-sizing:border-box"></span>` +
					`</div>`,
			});

		const EVENT_STYLE: Record<
			string,
			{ svg: string; ring: string; label: string }
		> = {
			supply: {
				ring: '#fbbf24',
				label: 'Supply drop',
				svg:
					`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#fbbf24" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
					`<path d="M2 5a6 4.5 0 0 1 12 0" fill="rgba(251,191,36,0.25)"/>` +
					`<path d="M2 5l3.5 4M14 5l-3.5 4M8 5v4"/>` +
					`<rect x="5.5" y="9" width="5" height="4.5" rx="0.5" fill="rgba(251,191,36,0.35)"/>` +
					`</svg>`,
			},
			meteor: {
				ring: '#f87171',
				label: 'Meteorite',
				svg:
					`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#f87171" stroke-width="1.3" stroke-linecap="round">` +
					`<path d="M14 2L7.5 8.5M13 6L9 10M10 3l-4 4"/>` +
					`<circle cx="5.5" cy="10.5" r="3.2" fill="rgba(248,113,113,0.35)"/>` +
					`</svg>`,
			},
			dungeon: {
				ring: '#a78bfa',
				label: 'Dungeon (open)',
				svg:
					`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#a78bfa" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
					`<path d="M3 14V7a5 5 0 0 1 10 0v7" fill="rgba(167,139,250,0.25)"/>` +
					`<path d="M2 14h12"/>` +
					`<path d="M6.5 14v-3.5a1.5 1.5 0 0 1 3 0V14" fill="rgba(167,139,250,0.5)"/>` +
					`</svg>`,
			},
		};
		const eventLayer = L.layerGroup().addTo(map);
		const eventMarkers = new Map<string, L.Marker>();
		const eventIcon = (style: { svg: string; ring: string }) =>
			L.divIcon({
				className: 'pal-event',
				iconSize: [26, 26],
				iconAnchor: [13, 13],
				html:
					`<div style="width:26px;height:26px;border-radius:50%;background:rgba(8,14,24,0.88);` +
					`border:2px solid ${style.ring};display:flex;align-items:center;justify-content:center;` +
					`box-shadow:0 0 10px ${style.ring}99">${style.svg}</div>`,
			});
		const syncEvents = (
			list: { kind: string; x: number; y: number; first_seen: number }[],
		) => {
			const seen = new Set<string>();
			for (const e of list) {
				const style = EVENT_STYLE[e.kind];
				if (!style) continue;
				const key = `${e.kind}:${Math.round(e.x / 100)}:${Math.round(e.y / 100)}`;
				seen.add(key);
				if (eventMarkers.has(key)) continue;
				const m = L.marker(gameToLatLng(e.x, e.y), {
					icon: eventIcon(style),
					keyboard: false,
					zIndexOffset: 400,
				});
				m.bindTooltip(
					() => {
						const mins = Math.max(
							0,
							Math.round((Date.now() - e.first_seen) / 60_000),
						);
						return `${style.label} — spotted ${mins}m ago`;
					},
					{ direction: 'top', offset: [0, -14], opacity: 0.95 },
				);
				m.addTo(eventLayer);
				eventMarkers.set(key, m);
			}
			for (const [key, m] of eventMarkers) {
				if (!seen.has(key)) {
					eventLayer.removeLayer(m);
					eventMarkers.delete(key);
				}
			}
		};

		const baseLayer = L.layerGroup().addTo(map);
		const baseMarkers = new Map<string, L.Marker>();
		let baseCountText: Text | null = null;
		const baseIcon = () =>
			L.divIcon({
				className: 'pal-base',
				iconSize: [26, 26],
				iconAnchor: [13, 13],
				html:
					`<div style="width:26px;height:26px;border-radius:50%;background:rgba(8,14,24,0.88);` +
					`border:2px solid #34d399;display:flex;align-items:center;justify-content:center;` +
					`box-shadow:0 0 10px #34d39999">` +
					`<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#34d399" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">` +
					`<path d="M2 8 8 2l6 6" />` +
					`<path d="M4 7v7h8V7" fill="rgba(52,211,153,0.25)"/>` +
					`<path d="M6.5 14v-4h3v4" fill="rgba(52,211,153,0.5)"/>` +
					`</svg></div>`,
			});
		type BasePal = {
			id: string;
			name: string;
			level: number;
			gender?: string;
			rank?: number;
			talents?: { hp: number; attack: number; defense: number };
			passives?: string[];
			hp?: number;
			max_hp?: number;
			sanity?: number;
			hunger?: number;
			lucky?: boolean;
			sick?: string;
			friendship?: number;
			souls?: {
				hp: number;
				attack: number;
				defense: number;
				craft: number;
			};
		};
		const palChip = (label: string, color: string) =>
			`<span style="display:inline-block;padding:0 6px;margin-right:4px;border-radius:8px;` +
			`border:1px solid ${color}55;color:${color};font-size:10px;line-height:1.6">${label}</span>`;
		const palCondition = (p: BasePal) => {
			const chips: string[] = [];
			if (p.lucky) chips.push(palChip('Lucky', '#fbbf24'));
			if (p.hp === 0) chips.push(palChip('Down', '#f87171'));
			if (p.sick)
				chips.push(
					palChip(
						esc(p.sick.replace(/([a-z])([A-Z])/g, '$1 $2')),
						'#f87171',
					),
				);
			if (p.hunger !== undefined && p.hunger <= 30)
				chips.push(palChip(`Hungry ${p.hunger}%`, '#fb923c'));
			if (p.sanity !== undefined && p.sanity < 70)
				chips.push(palChip(`Sanity ${p.sanity}`, '#c084fc'));
			if (p.souls) {
				const s = p.souls;
				const parts = [
					s.hp ? `HP+${s.hp}` : '',
					s.attack ? `ATK+${s.attack}` : '',
					s.defense ? `DEF+${s.defense}` : '',
					s.craft ? `WRK+${s.craft}` : '',
				]
					.filter(Boolean)
					.join(' ');
				if (parts) chips.push(palChip(parts, '#38bdf8'));
			}
			return chips.join('');
		};
		type BaseIntel = {
			id: string;
			name?: string;
			x: number;
			y: number;
			pals?: BasePal[];
		};
		type GuildIntel = {
			id: string;
			name: string;
			base_camp_level?: number;
			players?: { name: string }[];
			pal_handles?: number;
			bases?: BaseIntel[];
		};
		const esc = (s: string) =>
			s.replace(
				/[&<>"']/g,
				(c) =>
					({
						'&': '&amp;',
						'<': '&lt;',
						'>': '&gt;',
						'"': '&quot;',
						"'": '&#39;',
					})[c] as string,
			);
		const baseData = new Map<string, { g: GuildIntel; b: BaseIntel }>();
		const modal = document.createElement('div');
		modal.className = 'pal-base-modal';
		modal.style.cssText =
			'display:none;position:absolute;inset:0;z-index:1200;background:rgba(4,8,14,0.55);' +
			'backdrop-filter:blur(2px);align-items:center;justify-content:center;padding:1rem';
		modal.addEventListener('click', (ev) => {
			if (ev.target === modal) modal.style.display = 'none';
		});
		L.DomEvent.disableClickPropagation(modal);
		L.DomEvent.disableScrollPropagation(modal);
		el.appendChild(modal);
		const palRow = (p: BasePal) => {
			const clean = esc(p.id.replace(/^BOSS_/i, ''));
			const initial = esc((p.name || p.id).charAt(0).toUpperCase());
			return (
				`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-top:1px solid rgba(255,255,255,0.07)">` +
				`<img src="/palworld/palicons/T_${clean}_icon_normal.webp" width="34" height="34" loading="lazy" ` +
				`style="border-radius:50%;background:#0d1524" ` +
				`onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>` +
				`<span style="display:none;width:34px;height:34px;border-radius:50%;background:#173042;color:#7dd3fc;` +
				`align-items:center;justify-content:center;font-weight:600">${initial}</span>` +
				`<div style="flex:1;min-width:0">` +
				`<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">` +
				`${esc(p.name || clean)}` +
				(p.name ? `<span style="color:#8b9bb0"> · ${clean}</span>` : '') +
				(p.gender === 'F'
					? `<span style="color:#f0abfc"> ♀</span>`
					: p.gender === 'M'
						? `<span style="color:#7dd3fc"> ♂</span>`
						: '') +
				(p.rank && p.rank > 1
					? `<span style="color:#fbbf24"> ${'★'.repeat(Math.min(4, p.rank - 1))}</span>`
					: '') +
				`</div>` +
				(p.talents
					? `<div style="color:#8b9bb0;font-size:11px">IV ` +
						`<span style="color:#a7f3d0">${p.talents.hp}</span>/` +
						`<span style="color:#fca5a5">${p.talents.attack}</span>/` +
						`<span style="color:#93c5fd">${p.talents.defense}</span>` +
						(p.passives?.length
							? ` · ${p.passives.map((s) => esc(s.replace(/_/g, ' '))).join(', ')}`
							: '') +
						`</div>`
					: '') +
				(palCondition(p)
					? `<div style="margin-top:2px">${palCondition(p)}</div>`
					: '') +
				`</div>` +
				`<span style="color:#34d399;font-variant-numeric:tabular-nums">Lv ${p.level}</span></div>`
			);
		};
		const showBaseModal = (g: GuildIntel, b: BaseIntel) => {
			const roster = (g.players ?? []).map((p) => esc(p.name)).join(', ');
			const pals = b.pals ?? [];
			modal.innerHTML =
				`<div style="width:min(26rem,100%);max-height:100%;overflow:auto;background:rgba(10,16,28,0.97);` +
				`border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:16px 18px;color:#e8f0fa;` +
				`font:13px/1.6 system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,0.5)">` +
				`<div style="display:flex;align-items:center;gap:8px">` +
				`<strong style="font-size:15px;flex:1">${esc(g.name || 'Guild')}</strong>` +
				(g.base_camp_level
					? `<span style="color:#34d399">Camp Lv ${g.base_camp_level}</span>`
					: '') +
				`<button style="background:none;border:0;color:#8b9bb0;font-size:18px;cursor:pointer;line-height:1" ` +
				`onclick="this.closest('.pal-base-modal').style.display='none'">×</button></div>` +
				(roster
					? `<div style="color:#8b9bb0;margin-top:2px">${roster}</div>`
					: '') +
				`<div style="margin-top:10px;display:flex;justify-content:space-between;color:#8b9bb0">` +
				`<span>Working pals</span><span>${pals.length}</span></div>` +
				(pals.length
					? pals.map(palRow).join('')
					: `<div style="color:#8b9bb0;padding:8px 0">No pals assigned — or the save intel is still warming up.</div>`) +
				`</div>`;
			modal.style.display = 'flex';
		};
		const syncBases = (guilds: GuildIntel[]) => {
			const seen = new Set<string>();
			let total = 0;
			for (const g of guilds) {
				for (const b of g.bases ?? []) {
					total += 1;
					seen.add(b.id);
					baseData.set(b.id, { g, b });
					if (baseMarkers.has(b.id)) continue;
					const m = L.marker(gameToLatLng(b.x, b.y), {
						icon: baseIcon(),
						keyboard: false,
						zIndexOffset: 300,
					});
					m.bindTooltip(
						() => {
							const d = baseData.get(b.id);
							if (!d) return '';
							const names = (d.g.players ?? [])
								.map((p) => esc(p.name))
								.join(', ');
							return (
								`<strong>${esc(d.g.name || 'Guild')}</strong>` +
								(d.g.base_camp_level
									? ` — Camp Lv ${d.g.base_camp_level}`
									: '') +
								(names ? `<br/>${names}` : '') +
								`<br/>${(d.b.pals ?? []).length} working pals · click for details`
							);
						},
						{ direction: 'top', offset: [0, -14], opacity: 0.95 },
					);
					m.on('click', () => {
						const d = baseData.get(b.id);
						if (d) showBaseModal(d.g, d.b);
					});
					m.addTo(baseLayer);
					baseMarkers.set(b.id, m);
				}
			}
			for (const [id, m] of baseMarkers) {
				if (!seen.has(id)) {
					baseLayer.removeLayer(m);
					baseMarkers.delete(id);
					baseData.delete(id);
				}
			}
			if (baseCountText) baseCountText.textContent = `Bases (${total})`;
		};

		const countTexts = new Map<number, Text>();
		const control = new L.Control({ position: 'topright' });
		control.onAdd = () => {
			const div = L.DomUtil.create('div', 'pal-map-filters');
			div.style.cssText =
				'background:rgba(8,14,24,0.9);color:#e8f0fa;padding:8px 10px;border-radius:8px;' +
				'border:1px solid rgba(255,255,255,0.15);font:12px/1.7 system-ui,sans-serif';
			L.DomEvent.disableClickPropagation(div);
			const counts = new Map<number, number>();
			for (const eid of poiEnts)
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
					if (kind === KIND.player) {
						cb.checked
							? playerLayer.addTo(map)
							: map.removeLayer(playerLayer);
						return;
					}
					cb.checked
						? kindVisible.add(kind)
						: kindVisible.delete(kind);
					scheduleRedraw();
				};
				row.appendChild(cb);
				const txt = document.createTextNode(
					`${meta.plural} (${counts.get(kind) || 0})`,
				);
				countTexts.set(kind, txt);
				row.appendChild(txt);
				div.appendChild(row);
			}
			const baseRow = document.createElement('label');
			baseRow.style.cssText =
				'display:flex;gap:6px;align-items:center;cursor:pointer';
			const baseCb = document.createElement('input');
			baseCb.type = 'checkbox';
			baseCb.checked = true;
			baseCb.onchange = () => {
				baseCb.checked
					? baseLayer.addTo(map)
					: map.removeLayer(baseLayer);
			};
			baseRow.appendChild(baseCb);
			baseCountText = document.createTextNode('Bases (0)');
			baseRow.appendChild(baseCountText);
			div.appendChild(baseRow);
			return div;
		};
		control.addTo(map);

		if (import.meta.env.DEV) {
			(window as unknown as Record<string, unknown>).__palmap = {
				map,
				canvas,
				pane,
				drawPos,
				latlngs,
				getOrigin: () => [originX, originY],
				getRedraws: () => redrawCount,
			};
		}

		const liveUrl =
			new URLSearchParams(window.location.search).get('live') ||
			LIVE_URL_DEFAULT;
		let stopped = false;
		const onSnapshot = (snap: LiveSnapshot) => {
			if (stopped) return;
			if (snap.offline) {
				for (const [name, p] of playerMarkers) {
					playerLayer.removeLayer(p.m);
					playerMarkers.delete(name);
				}
				const span = countTexts.get(KIND.player);
				if (span) span.textContent = 'Players (offline)';
				return;
			}
			syncEvents(snap.events);
			const seen = new Set<string>();
			for (const p of snap.players) {
				seen.add(p.name);
				const ll = L.latLng(gameToLatLng(p.x, p.y));
				const existing = playerMarkers.get(p.name);
				if (existing) {
					existing.from = existing.m.getLatLng();
					existing.to = ll;
					existing.t0 = performance.now();
				} else {
					const m = L.marker(ll, {
						icon: playerIcon(`${p.name} · Lv ${p.level}`),
						keyboard: false,
						interactive: false,
						zIndexOffset: 500,
					});
					m.addTo(playerLayer);
					playerMarkers.set(p.name, {
						m,
						from: ll,
						to: ll,
						t0: performance.now(),
					});
				}
			}
			for (const [name, p] of playerMarkers) {
				if (!seen.has(name)) {
					playerLayer.removeLayer(p.m);
					playerMarkers.delete(name);
				}
			}
			if (!playerRaf && playerMarkers.size)
				playerRaf = requestAnimationFrame(playerFrame);
			serverTimers.clear();
			for (const b of snap.bosses) {
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
				if (bestEid >= 0) serverTimers.set(bestEid, b.respawn_at);
			}
			if (snap.bosses.length) scheduleRedraw();
			const span = countTexts.get(KIND.player);
			if (span) span.textContent = `Players (${snap.players.length})`;
		};
		DroidEvents.on('palworld-live-snapshot', onSnapshot);
		startLivePoller(liveUrl);

		const basesUrl = liveUrl.replace(/\/live\/players.*/, '/live/bases');
		const pollBases = async () => {
			try {
				const res = await fetch(basesUrl, { cache: 'no-store' });
				if (!res.ok) return;
				const d = (await res.json()) as { guilds?: GuildIntel[] };
				if (Array.isArray(d.guilds)) syncBases(d.guilds);
			} catch {
				return;
			}
		};
		pollBases();
		const basesTick = setInterval(pollBases, 120_000);

		return () => {
			stopped = true;
			DroidEvents.off('palworld-live-snapshot', onSnapshot);
			clearInterval(cooldownTick);
			clearInterval(basesTick);
			if (wheelRaf) cancelAnimationFrame(wheelRaf);
			if (playerRaf) cancelAnimationFrame(playerRaf);
			if (redrawRaf) cancelAnimationFrame(redrawRaf);
			window.clearTimeout(wheelEndTimer);
			el.removeEventListener('wheel', onWheel);
			el.removeEventListener('mousemove', onMouseMove);
			el.removeEventListener('mousedown', onMouseDown);
			el.removeEventListener('click', onClick);
			map.remove();
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
