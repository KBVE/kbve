export const AUTH_LOGON_CHALLENGE = 0x00;
export const SMSG_AUTH_CHALLENGE = 0x01ec;

export function logonChallenge(account: string, build = 12340): Buffer {
	const name = Buffer.from(account.toUpperCase(), 'ascii');
	const body = Buffer.alloc(30 + name.length);
	let o = 0;
	body.write('WoW\0', o, 'ascii');
	o += 4;
	body[o++] = 3;
	body[o++] = 3;
	body[o++] = 5;
	body.writeUInt16LE(build, o);
	o += 2;
	body.write('68x\0', o, 'ascii');
	o += 4;
	body.write('niW\0', o, 'ascii');
	o += 4;
	body.write('SUne', o, 'ascii');
	o += 4;
	body.writeUInt32LE(0, o);
	o += 4;
	body.writeUInt32LE(0x0100007f, o);
	o += 4;
	body[o++] = name.length;
	name.copy(body, o);

	const header = Buffer.alloc(4);
	header[0] = AUTH_LOGON_CHALLENGE;
	header[1] = 0x08;
	header.writeUInt16LE(body.length, 2);
	return Buffer.concat([header, body]);
}
