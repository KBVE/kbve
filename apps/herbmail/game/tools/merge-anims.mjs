import { NodeIO } from '@gltf-transform/core';

// Merge selected animation clips from UAL Source GLBs into the game's
// character-anim.glb. Rigs share UE bone names; channels are rebuilt against
// the game skeleton by name ('Head' -> 'head'; *_leaf tip bones dropped).
//
//   node tools/merge-anims.mjs <target.glb> <source.glb> <clip> [clip...]

const [target, source, ...clips] = process.argv.slice(2);
if (!target || !source || clips.length === 0) {
	console.error('usage: merge-anims.mjs <target.glb> <source.glb> <clip...>');
	process.exit(1);
}

const RENAME = { Head: 'head' };

const io = new NodeIO();
const tgt = await io.read(target);
const src = await io.read(source);

const tgtNodes = new Map(
	tgt
		.getRoot()
		.listNodes()
		.map((n) => [n.getName(), n]),
);
const existing = new Set(
	tgt
		.getRoot()
		.listAnimations()
		.map((a) => a.getName()),
);
const buffer = tgt.getRoot().listBuffers()[0];

let merged = 0;
for (const name of clips) {
	if (existing.has(name)) {
		console.log(`skip ${name} (already present)`);
		continue;
	}
	const srcAnim = src
		.getRoot()
		.listAnimations()
		.find((a) => a.getName() === name);
	if (!srcAnim) {
		console.error(`MISSING in source: ${name}`);
		process.exitCode = 1;
		continue;
	}
	const anim = tgt.createAnimation(name);
	let channels = 0;
	for (const ch of srcAnim.listChannels()) {
		const srcNode = ch.getTargetNode();
		if (!srcNode) continue;
		const boneName = RENAME[srcNode.getName()] ?? srcNode.getName();
		const node = tgtNodes.get(boneName);
		if (!node) continue;
		const s = ch.getSampler();
		const input = tgt
			.createAccessor()
			.setType('SCALAR')
			.setArray(s.getInput().getArray().slice())
			.setBuffer(buffer);
		const output = tgt
			.createAccessor()
			.setType(s.getOutput().getType())
			.setArray(s.getOutput().getArray().slice())
			.setBuffer(buffer);
		const sampler = tgt
			.createAnimationSampler()
			.setInterpolation(s.getInterpolation())
			.setInput(input)
			.setOutput(output);
		const channel = tgt
			.createAnimationChannel()
			.setTargetNode(node)
			.setTargetPath(ch.getTargetPath())
			.setSampler(sampler);
		anim.addSampler(sampler).addChannel(channel);
		channels++;
	}
	console.log(`merged ${name} (${channels} channels)`);
	merged++;
}

await io.write(target, tgt);
console.log(`done: ${merged} clips written to ${target}`);
