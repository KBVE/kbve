import { readFileSync } from 'fs';
const buf = readFileSync('/Users/alappatel/Documents/GitHub/kbve/apps/herbmail/herbmail-game/public/models/character-anim.glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const names = (json.animations || []).map((a) => a.name);
console.log(names.length, 'clips');
console.log(names.filter((n) => /_L\b|_R\b|_L_|_R_|Left|Right|Bwd|Back|Strafe/i.test(n)).join('\n') || 'NO L/R/BWD CLIPS');
