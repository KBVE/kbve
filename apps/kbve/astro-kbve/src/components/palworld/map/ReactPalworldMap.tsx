import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import bosses from './bosses.json';

const MAX_ZOOM = 8;
const PAL_TILE_BASE = '/palworld/tiles';
const PAL_MAX_NATIVE_ZOOM = 6;
const WT_TILE_BASE = '/palworld/wt-overlay';

const MAIN_X0 = -1099400;
const MAIN_Y0 = -724400;
const MAIN_S = 1448800;

export function gameToLatLng(gx: number, gy: number): L.LatLngTuple {
	const x = (256 * (gy - MAIN_Y0)) / MAIN_S;
	const yd = 256 * (1 - (gx - MAIN_X0) / MAIN_S);
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
		const palpagos = L.tileLayer(`${PAL_TILE_BASE}/{z}/{x}/{y}.jpg`, {
			tileSize: 256,
			minZoom: 0,
			maxZoom: MAX_ZOOM,
			maxNativeZoom: PAL_MAX_NATIVE_ZOOM,
			noWrap: true,
			bounds: palBounds,
			keepBuffer: 4,
		});
		const worldTree = L.tileLayer(`${WT_TILE_BASE}/{z}/{x}/{y}.webp`, {
			tileSize: 256,
			minZoom: 0,
			maxZoom: MAX_ZOOM,
			maxNativeZoom: MAX_ZOOM,
			noWrap: true,
			bounds: wtBounds,
			keepBuffer: 4,
		});
		palpagos.addTo(map);
		worldTree.addTo(map);
		const bossLayer = L.layerGroup(
			bosses.map((b) =>
				L.marker(gameToLatLng(b.x, b.y), {
					icon: L.divIcon({
						className: 'pal-boss-marker',
						html: `<img src="/palworld/palicons/${b.icon}.png" alt="${b.name}" style="width:36px;height:36px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);box-shadow:0 1px 4px rgba(0,0,0,0.6);background:#0b1420" />`,
						iconSize: [36, 36],
						iconAnchor: [18, 18],
					}),
				}).bindTooltip(`${b.name} · Lv ${b.lv}`, { direction: 'top' }),
			),
		);
		bossLayer.addTo(map);
		L.control
			.layers(undefined, { Bosses: bossLayer }, { collapsed: false })
			.addTo(map);
		return () => {
			map.remove();
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
			}}
		/>
	);
}
