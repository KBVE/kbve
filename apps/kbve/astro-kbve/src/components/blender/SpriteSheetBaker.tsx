/**
 * SpriteSheetBaker — in-browser iso sprite-sheet baker (docs island).
 *
 * The Blender baker (kbve-model-sprites, kbve.sprite.model_sprites) is the
 * canonical, high-fidelity baker. This is its zero-install browser twin: pick a
 * model + skin, dial the same yaw / elevation / lay-flat-pitch knobs, and rasterize
 * the 360 spin straight from WebGL into a downloadable sheet — plus the matching
 * Blender command and a ready-to-paste `EnvDef`. Math mirrors the Python baker 1:1
 * (Z-up world, hull pitched flat, orthographic camera along -Y lifted by elevation).
 *
 * Mounted in application/blender.mdx via `<SpriteSheetBaker client:only="react" />`.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

type Scene3D = {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	cam: THREE.OrthographicCamera;
	yawGroup: THREE.Group; // spins about Z (heading)
	pitchGroup: THREE.Group; // lay-flat pitch about X
	controls: OrbitControls;
	tile: THREE.LineSegments; // ground reference, scaled to model
	modelSize: number;
};

const PREVIEW = 360; // on-screen canvas px
const FRAME_OPTS = [1, 8, 16, 32];
const RES_OPTS = [128, 256, 512];

export default function SpriteSheetBaker() {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const s3 = useRef<Scene3D | null>(null);
	const modelObj = useRef<THREE.Object3D | null>(null);

	const [yaw, setYaw] = useState(45);
	const [elev, setElev] = useState(30);
	const [pitch, setPitch] = useState(90);
	const [frames, setFrames] = useState(16);
	const [res, setRes] = useState(256);
	const [emit, setEmit] = useState(0.55);
	const [ref, setRef] = useState('ship');
	const [status, setStatus] = useState('Pick a model (.obj / .glb) to begin.');
	const [modelName, setModelName] = useState('');

	// --- one-time three setup ---
	useEffect(() => {
		const host = hostRef.current;
		if (!host) return;
		const renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true, // required to copy frames out during bake
		});
		renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
		renderer.setSize(PREVIEW, PREVIEW);
		renderer.setClearColor(0x000000, 0);
		host.appendChild(renderer.domElement);

		const scene = new THREE.Scene();
		THREE.Object3D.DEFAULT_UP.set(0, 0, 1);
		const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 100);
		cam.up.set(0, 0, 1);
		scene.add(new THREE.AmbientLight(0xffffff, 0.9));
		const sun = new THREE.DirectionalLight(0xffffff, 1.6);
		sun.position.set(1, -1, 2);
		scene.add(sun);

		// iso tile diamond reference on the ground
		const tile = new THREE.LineSegments(
			new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.5, 0.5)),
			new THREE.LineBasicMaterial({ color: 0x3a73e8 }),
		);
		scene.add(tile);

		const yawGroup = new THREE.Group();
		const pitchGroup = new THREE.Group();
		yawGroup.add(pitchGroup);
		scene.add(yawGroup);

		const controls = new OrbitControls(cam, renderer.domElement);
		controls.enablePan = false;

		s3.current = { renderer, scene, cam, yawGroup, pitchGroup, controls, tile, modelSize: 1 };

		let raf = 0;
		const loop = () => {
			raf = requestAnimationFrame(loop);
			renderer.render(scene, cam);
		};
		loop();

		return () => {
			cancelAnimationFrame(raf);
			controls.dispose();
			renderer.dispose();
			renderer.domElement.remove();
			s3.current = null;
		};
	}, []);

	// --- apply transform / camera whenever a knob changes ---
	useEffect(() => {
		const s = s3.current;
		if (!s) return;
		s.yawGroup.rotation.set(0, 0, THREE.MathUtils.degToRad(yaw));
		s.pitchGroup.rotation.set(THREE.MathUtils.degToRad(pitch), 0, 0);
		placeCamera(s, elev);
	}, [yaw, pitch, elev]);

	function placeCamera(s: Scene3D, elevDeg: number) {
		const e = THREE.MathUtils.degToRad(elevDeg);
		const dist = s.modelSize * 3;
		s.cam.position.set(0, -dist * Math.cos(e), dist * Math.sin(e));
		s.cam.lookAt(0, 0, 0);
		s.controls.target.set(0, 0, 0);
		const half = s.modelSize * 0.8;
		s.cam.left = -half;
		s.cam.right = half;
		s.cam.top = half;
		s.cam.bottom = -half;
		s.cam.updateProjectionMatrix();
	}

	async function onModel(file: File) {
		const s = s3.current;
		if (!s) return;
		setStatus(`Loading ${file.name}…`);
		setModelName(file.name);
		if (modelObj.current) {
			s.pitchGroup.remove(modelObj.current);
			modelObj.current = null;
		}
		const url = URL.createObjectURL(file);
		try {
			const ext = file.name.split('.').pop()?.toLowerCase();
			let obj: THREE.Object3D;
			if (ext === 'glb' || ext === 'gltf') {
				const gltf = await new GLTFLoader().loadAsync(url);
				obj = gltf.scene;
			} else if (ext === 'fbx') {
				obj = await new FBXLoader().loadAsync(url); // often cm-scale / Y-up
			} else {
				obj = await new OBJLoader().loadAsync(url); // .obj
			}
			// recenter on origin
			const box = new THREE.Box3().setFromObject(obj);
			const ctr = box.getCenter(new THREE.Vector3());
			obj.position.sub(ctr);
			const size = box.getSize(new THREE.Vector3());
			s.modelSize = Math.max(size.x, size.y, size.z) || 1;
			s.tile.scale.setScalar(s.modelSize * 2); // keep the ground diamond visible at any scale
			s.pitchGroup.add(obj);
			modelObj.current = obj;
			placeCamera(s, elev);
			applyTexture(); // reapply if a skin was already chosen
			setStatus('Loaded. Add a skin (optional), dial the angle, then bake.');
		} catch (err) {
			setStatus(`Load failed: ${(err as Error).message}`);
		} finally {
			URL.revokeObjectURL(url);
		}
	}

	const skinTex = useRef<THREE.Texture | null>(null);
	function applyTexture() {
		const obj = modelObj.current;
		if (!obj || !skinTex.current) return;
		const mat = new THREE.MeshPhongMaterial({
			map: skinTex.current,
			emissive: 0x222933,
			emissiveMap: skinTex.current,
			emissiveIntensity: emit,
			shininess: 8,
		});
		obj.traverse((o) => {
			if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = mat;
		});
	}

	async function onSkin(file: File) {
		const url = URL.createObjectURL(file);
		const tex = await new THREE.TextureLoader().loadAsync(url);
		tex.colorSpace = THREE.SRGBColorSpace;
		skinTex.current = tex;
		applyTexture();
		setStatus('Skin applied.');
	}
	useEffect(() => applyTexture(), [emit]);

	// --- bake: rasterize N facings into a square sheet, download PNG ---
	async function bake() {
		const s = s3.current;
		if (!s || !modelObj.current) {
			setStatus('Load a model first.');
			return;
		}
		setStatus('Baking…');
		const cols = Math.ceil(Math.sqrt(frames));
		const rows = Math.ceil(frames / cols);
		const sheet = document.createElement('canvas');
		sheet.width = cols * res;
		sheet.height = rows * res;
		const ctx = sheet.getContext('2d')!;

		const prevSize = new THREE.Vector2();
		s.renderer.getSize(prevSize);
		s.renderer.setSize(res, res, false);

		for (let i = 0; i < frames; i++) {
			s.yawGroup.rotation.set(0, 0, THREE.MathUtils.degToRad(yaw + (360 * i) / frames));
			s.renderer.render(s.scene, s.cam);
			const c = i % cols;
			const r = Math.floor(i / cols);
			ctx.drawImage(s.renderer.domElement, c * res, r * res, res, res);
		}

		// restore live preview
		s.renderer.setSize(prevSize.x, prevSize.y, false);
		s.yawGroup.rotation.set(0, 0, THREE.MathUtils.degToRad(yaw));

		await new Promise<void>((resolve) =>
			sheet.toBlob((blob) => {
				if (blob) {
					const a = document.createElement('a');
					a.href = URL.createObjectURL(blob);
					a.download = `${ref}.png`;
					a.click();
					URL.revokeObjectURL(a.href);
				}
				resolve();
			}, 'image/png'),
		);
		setStatus(`Baked ${frames} facings → ${cols}×${rows} sheet (${ref}.png).`);
	}

	const blenderCmd = useMemo(
		() =>
			`blender -b -P gen-model-sprites.py -- \\\n` +
			` --model ${modelName || 'model.obj'} --skin skin.jpg --out ${ref} \\\n` +
			` --frames ${frames} --res ${res} --elev ${elev} --pitch ${pitch} --yaw-offset ${yaw}`,
		[modelName, ref, frames, res, elev, pitch, yaw],
	);

	const envDef = useMemo(() => {
		const dir = frames > 1 ? `\n\tdirections: ${frames},` : '';
		return (
			`export const ${ref.toUpperCase()}_ENV: EnvDef = {\n` +
			`\tref: '${ref}',\n` +
			`\tsheet: '/assets/arcade/arpg/environment/structures/${ref}/${ref}.png',\n` +
			`\tframeWidth: ${res},\n\tframeHeight: ${res},\n` +
			`\tframes: 1,\n\tframeRate: 1,\n` +
			`\tdisplayWidth: 104,\n\tdisplayHeight: 104,\n\toriginY: 0.52,${dir}\n};`
		);
	}, [ref, frames, res]);

	return (
		<div className="not-content" style={wrap}>
			<div ref={hostRef} style={canvasBox} />
			<div style={panel}>
				<div style={row}>
					<label style={btn}>
						Model (.obj/.glb)
						<input
							type="file"
							accept=".obj,.glb,.gltf,.fbx"
							style={{ display: 'none' }}
							onChange={(e) => e.target.files?.[0] && onModel(e.target.files[0])}
						/>
					</label>
					<label style={btn}>
						Skin (image)
						<input
							type="file"
							accept="image/*"
							style={{ display: 'none' }}
							onChange={(e) => e.target.files?.[0] && onSkin(e.target.files[0])}
						/>
					</label>
				</div>

				<Slider label="Yaw / heading" v={yaw} set={setYaw} min={0} max={360} />
				<Slider label="Camera elevation (iso)" v={elev} set={setElev} min={5} max={90} />
				<Slider label="Lay-flat pitch" v={pitch} set={setPitch} min={0} max={180} />
				<Slider label="Emissive mix ×100" v={Math.round(emit * 100)} set={(n) => setEmit(n / 100)} min={0} max={100} />

				<div style={row}>
					<Pick label="Frames" v={frames} set={setFrames} opts={FRAME_OPTS} />
					<Pick label="Resolution" v={res} set={setRes} opts={RES_OPTS} />
				</div>
				<label style={fieldLabel}>
					env ref
					<input value={ref} onChange={(e) => setRef(e.target.value || 'ship')} style={textIn} />
				</label>

				<button onClick={bake} style={bakeBtn}>
					Bake &amp; download {ref}.png
				</button>
				<div style={statusBox}>{status}</div>

				<details style={det}>
					<summary>Blender command (high-fidelity bake)</summary>
					<pre style={pre}>{blenderCmd}</pre>
				</details>
				<details style={det}>
					<summary>EnvDef snippet (env.ts)</summary>
					<pre style={pre}>{envDef}</pre>
				</details>
			</div>
		</div>
	);
}

function Slider({
	label,
	v,
	set,
	min,
	max,
}: {
	label: string;
	v: number;
	set: (n: number) => void;
	min: number;
	max: number;
}) {
	return (
		<label style={fieldLabel}>
			<span style={{ display: 'flex', justifyContent: 'space-between' }}>
				<span>{label}</span>
				<span style={{ color: '#ffd479' }}>{v}°</span>
			</span>
			<input type="range" min={min} max={max} value={v} onChange={(e) => set(+e.target.value)} />
		</label>
	);
}

function Pick({
	label,
	v,
	set,
	opts,
}: {
	label: string;
	v: number;
	set: (n: number) => void;
	opts: number[];
}) {
	return (
		<label style={{ ...fieldLabel, flex: 1 }}>
			{label}
			<select value={v} onChange={(e) => set(+e.target.value)} style={textIn}>
				{opts.map((o) => (
					<option key={o} value={o}>
						{o}
					</option>
				))}
			</select>
		</label>
	);
}

// --- inline styles (keeps the island self-contained, theme-agnostic) ---
const wrap: React.CSSProperties = {
	display: 'flex',
	gap: 16,
	flexWrap: 'wrap',
	background: '#10141c',
	border: '1px solid #2c3650',
	borderRadius: 10,
	padding: 14,
	color: '#cdd6e4',
	font: '13px ui-monospace,Menlo,monospace',
};
const canvasBox: React.CSSProperties = {
	width: PREVIEW,
	height: PREVIEW,
	maxWidth: '100%',
	background: 'repeating-conic-gradient(#1a2030 0% 25%, #151b27 0% 50%) 50% / 24px 24px',
	borderRadius: 8,
	overflow: 'hidden',
	flex: '0 0 auto',
};
const panel: React.CSSProperties = { flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 };
const row: React.CSSProperties = { display: 'flex', gap: 8 };
const fieldLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, color: '#9fb0cc' };
const btn: React.CSSProperties = {
	flex: 1,
	textAlign: 'center',
	padding: '8px',
	background: '#222a3d',
	border: '1px solid #2c3650',
	borderRadius: 6,
	cursor: 'pointer',
};
const bakeBtn: React.CSSProperties = { padding: 10, background: '#2b62d6', color: '#fff', border: 0, borderRadius: 6, cursor: 'pointer', marginTop: 4 };
const textIn: React.CSSProperties = { background: '#0d1118', color: '#cdd6e4', border: '1px solid #2c3650', borderRadius: 5, padding: '5px 7px' };
const statusBox: React.CSSProperties = { fontSize: 11, color: '#7fe0a0', minHeight: 14 };
const det: React.CSSProperties = { background: '#0d1118', borderRadius: 6, padding: '4px 8px' };
const pre: React.CSSProperties = { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 11, color: '#9fd8b0', margin: '6px 0 2px' };
