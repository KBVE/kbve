/**
 * Barrel for the KBVE typed API client.
 *
 * Public surface:
 *   - `kbveApi` — singleton openapi-fetch client (same-origin)
 *   - `createKbveClient(options)` — factory for custom baseUrl / headers
 *   - `KbveClient` — strong type alias of the openapi-fetch client
 *   - `paths`, `components`, `operations` — spec-derived types for use in
 *     consumer code (e.g. typing helpers, narrowing responses)
 */

export { createKbveClient, kbveApi, type KbveClient } from './client';
export type { components, operations, paths } from './openapi-types';
