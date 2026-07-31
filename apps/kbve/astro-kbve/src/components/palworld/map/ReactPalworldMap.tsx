import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
	KIND,
	KIND_META,
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

export function gameToLatLng(gx: number, gy: number): L.LatLngTuple {
	const [x, yd] = gameToUnits(gx, gy);
	return [-yd, x];
}

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
		const ents = markerEntities(world);
		const visible = new Set<number>(Object.values(KIND));
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
			'position:absolute;inset:0;z-index:450;pointer-events:none';
		el.appendChild(canvas);
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

		const drawList: number[] = [];
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
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.clearRect(0, 0, w, h);
			screenXY.refresh();
			const zoom = map.getZoom();
			drawList.length = 0;
			for (const eid of ents) {
				const kind = Kind.v[eid];
				if (!visible.has(kind)) continue;
				const meta = KIND_META[kindName(kind)];
				if (zoom < meta.minZoom) continue;
				const sx = screenXY.x(Pos.x[eid]);
				const sy = screenXY.y(Pos.yd[eid]);
				if (sx < -40 || sy < -40 || sx > w + 40 || sy > h + 40) continue;
				drawList.push(eid);
				const size = meta.size;
				const src = iconKeys[eid] || meta.icon;
				const img = loadImage(src);
				if (!img.complete || !img.naturalWidth) continue;
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
		};

		const kindName = (k: number): KindName =>
			(Object.keys(KIND) as KindName[])[k];

		const onMouseMove = (ev: MouseEvent) => {
			const rect = el.getBoundingClientRect();
			const mx = ev.clientX - rect.left;
			const my = ev.clientY - rect.top;
			let best = -1;
			let bestD = 18 * 18;
			for (const eid of drawList) {
				const dx = screenXY.x(Pos.x[eid]) - mx;
				const dy = screenXY.y(Pos.yd[eid]) - my;
				const d = dx * dx + dy * dy;
				if (d < bestD) {
					bestD = d;
					best = eid;
				}
			}
			if (best >= 0) {
				tooltip.textContent = labels[best];
				tooltip.style.left = `${screenXY.x(Pos.x[best])}px`;
				tooltip.style.top = `${screenXY.y(Pos.yd[best])}px`;
				tooltip.style.display = 'block';
			} else {
				tooltip.style.display = 'none';
			}
		};
		el.addEventListener('mousemove', onMouseMove);
		el.addEventListener('mouseleave', () => {
			tooltip.style.display = 'none';
		});

		map.on('move zoom zoomend viewreset resize', scheduleDraw);
		scheduleDraw();

		const control = new L.Control({ position: 'topright' });
		control.onAdd = () => {
			const div = L.DomUtil.create('div', 'pal-map-filters');
			div.style.cssText =
				'background:rgba(8,14,24,0.9);color:#e8f0fa;padding:8px 10px;border-radius:8px;' +
				'border:1px solid rgba(255,255,255,0.15);font:12px/1.7 system-ui,sans-serif';
			L.DomEvent.disableClickPropagation(div);
			const counts = new Map<number, number>();
			for (const eid of ents)
				counts.set(Kind.v[eid], (counts.get(Kind.v[eid]) || 0) + 1);
			for (const [name, kind] of Object.entries(KIND)) {
				const meta = KIND_META[name as KindName];
				const row = document.createElement('label');
				row.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer';
				const cb = document.createElement('input');
				cb.type = 'checkbox';
				cb.checked = true;
				cb.onchange = () => {
					cb.checked ? visible.add(kind) : visible.delete(kind);
					scheduleDraw();
				};
				row.appendChild(cb);
				row.appendChild(
					document.createTextNode(
						`${meta.plural} (${counts.get(kind) || 0})`,
					),
				);
				div.appendChild(row);
			}
			return div;
		};
		control.addTo(map);

		return () => {
			el.removeEventListener('mousemove', onMouseMove);
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
