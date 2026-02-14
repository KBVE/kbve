import { Crypto } from '@peculiar/webcrypto';
import 'fake-indexeddb/auto';

// Polyfill Web Crypto API for test environment
const crypto = new Crypto();
Object.defineProperty(globalThis, 'crypto', { value: crypto });
