import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { loadWaterAssets } from '../water/assets';

// Puts the skybox behind the scene so it shows through open-ceiling oasis rooms.
// The enclosed dungeon still reads dark — walls occlude the background — so only
// the openings reveal sky. Reuses the water cubemap (already loaded for pool
// reflections), so no extra fetch.
export function DungeonSky() {
	const scene = useThree((s) => s.scene);
	useEffect(() => {
		let alive = true;
		loadWaterAssets().then((a) => {
			if (alive) scene.background = a.cubemap;
		});
		return () => {
			alive = false;
			if (
				scene.background &&
				(scene.background as { isCubeTexture?: boolean }).isCubeTexture
			)
				scene.background = null;
		};
	}, [scene]);
	return null;
}
