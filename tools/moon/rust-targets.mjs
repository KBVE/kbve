#!/usr/bin/env node
// Prints the rustup targets declared under `rust.targets` in
// .moon/toolchains.yml, space separated, so CI can provision them before moon
// does. moon sets the rust toolchain up once per cargo workspace root and runs
// those setups concurrently; rustup takes no lock on ~/.rustup/downloads, so
// two of them downloading the same component race on its .partial file.
//
// Hand-parsed rather than through a yaml dependency: this runs before the
// install step in some workflows, and the shape it reads is two levels deep.

import { readFileSync } from 'node:fs';

const CONFIG = '.moon/toolchains.yml';

function rustTargets(source) {
    const lines = source.split('\n');
    const start = lines.findIndex((line) => line === 'rust:');
    if (start === -1) return [];

    const targets = [];
    let inTargets = false;

    for (const line of lines.slice(start + 1)) {
        // A non-indented, non-empty line ends the rust block.
        if (line.trim() !== '' && !line.startsWith(' ')) break;

        if (/^ {4}targets:\s*$/.test(line)) {
            inTargets = true;
            continue;
        }
        if (!inTargets) continue;

        const item = line.match(/^ {8}- ['"]?([^'"\s]+)['"]?\s*$/);
        if (item) {
            targets.push(item[1]);
            continue;
        }
        // Any other line at or above the list's indent closes it.
        if (line.trim() !== '' && !line.startsWith(' '.repeat(8))) break;
    }

    return targets;
}

process.stdout.write(rustTargets(readFileSync(CONFIG, 'utf8')).join(' '));
