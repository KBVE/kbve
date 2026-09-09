// @vitest-environment happy-dom
//
// Importing the material reaches charShadow, which installs a debug handle on
// window at module scope under DEV. The shader source is a plain string and
// needs no DOM of its own; this only satisfies that import.
import { describe, it, expect } from 'vitest';
import { PSX_FRAGMENT_SHADER } from './PsxMaterial';

// The whole point of gating the silhouette clip at build time is that the
// statement is absent from the compiled program. A uniform branch would read as
// "off" while still costing early-Z, so asserting the uniform is 0 would prove
// nothing — the source text is the thing that matters.
// Comments are stripped before asserting: the injected POM chunk explains in
// prose that a fragment "should be discarded", which a naive substring match
// reads as the statement itself.
const code = PSX_FRAGMENT_SHADER.replace(/\/\*[\s\S]*?\*\//g, '').replace(
	/\/\/[^\n]*/g,
	'',
);

describe('psx fragment shader', () => {
	it('compiles without discard so early-Z stays available', () => {
		expect(code).not.toContain('discard');
	});

	it('still contains the lighting work it is supposed to', () => {
		expect(code).toContain('visibility(');
		expect(code).toContain('skyAtWorld(');
		expect(code).toContain('charShadow(');
	});

	it('writes no explicit fragment depth, the other early-Z disqualifier', () => {
		expect(code).not.toContain('gl_FragDepth');
	});
});
