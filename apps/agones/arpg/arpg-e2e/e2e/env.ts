export const JWT_SECRET = 'e2e-test-secret-do-not-use-in-production';

export const SERVER_PORT = 7979;
export const WEB_PORT = 5402;

export const SERVER_HTTP = `http://localhost:${SERVER_PORT}`;
export const SERVER_WS = `ws://localhost:${SERVER_PORT}/ws`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;

// Re-exported, never redeclared: a hardcoded copy silently drifted to 14 while
// the wire moved to 16, which made the handshake assertion assert the wrong number.
export { PROTOCOL_VERSION } from '@kbve/laser/wire';
