import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import { aoEnabled } from './qualityStore';

export function AOComposer() {
	const gl = useThree((s) => s.gl);
	const scene = useThree((s) => s.scene);
	const camera = useThree((s) => s.camera);
	const size = useThree((s) => s.size);
	const lastPr = useRef(0);

	const { composer, ao, plain } = useMemo(() => {
		const c = new EffectComposer(gl);
		const aoPass = new N8AOPass(scene, camera, size.width, size.height);
		aoPass.configuration.aoRadius = 0.8;
		aoPass.configuration.distanceFalloff = 1.0;
		aoPass.configuration.intensity = 1.5;
		aoPass.configuration.halfRes = true;
		aoPass.configuration.gammaCorrection = false;
		// N8AOPass is what draws the scene into the chain, so disabling it would
		// leave OutputPass copying an unwritten buffer (black). Exactly one of
		// these two is ever enabled.
		const renderPass = new RenderPass(scene, camera);
		renderPass.enabled = false;
		c.addPass(renderPass);
		c.addPass(aoPass);
		c.addPass(new OutputPass());
		return { composer: c, ao: aoPass, plain: renderPass };
	}, [gl, scene, camera]);

	useEffect(() => {
		lastPr.current = gl.getPixelRatio();
		composer.setPixelRatio(lastPr.current);
		composer.setSize(size.width, size.height);
	}, [composer, gl, size]);

	useEffect(() => () => composer.dispose(), [composer]);

	useFrame(() => {
		// Adaptive quality changes the renderer pixel ratio live; keep the
		// composer's targets matched or the AO samples a stale-res buffer.
		const pr = gl.getPixelRatio();
		if (pr !== lastPr.current) {
			lastPr.current = pr;
			composer.setPixelRatio(pr);
			composer.setSize(size.width, size.height);
		}
		// Swap which pass draws the scene (not the composer) so OutputPass still
		// applies the single sRGB encode the PSX materials output linear for.
		const on = aoEnabled();
		ao.enabled = on;
		plain.enabled = !on;
		composer.render();
	}, 1);

	return null;
}
