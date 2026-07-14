import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';

export function AOComposer() {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const camera = useThree((s) => s.camera);
	const size = useThree((s) => s.size);

	const composer = useMemo(() => {
		const c = new EffectComposer(gl);
		const ao = new N8AOPass(scene, camera, size.width, size.height);
		ao.configuration.aoRadius = 0.8;
		ao.configuration.distanceFalloff = 1.0;
		ao.configuration.intensity = 1.5;
		ao.configuration.halfRes = true;
		ao.configuration.gammaCorrection = false;
		c.addPass(ao);
		c.addPass(new OutputPass());
		return c;
	}, [gl, scene, camera]);

	useEffect(() => {
		composer.setPixelRatio(gl.getPixelRatio());
		composer.setSize(size.width, size.height);
	}, [composer, gl, size]);

	useEffect(() => () => composer.dispose(), [composer]);

	useFrame(() => {
		composer.render();
	}, 1);

	return null;
}
