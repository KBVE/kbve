// src/lib/gateway/workers.ts
// Worker URL imports for Vite bundling

// Use Vite's ?worker&url syntax to get bundled worker URLs
import DbWorkerUrl from '../../workers/supabase.db?worker&url';
import WebSocketWorkerUrl from '../../workers/supabase.websocket?worker&url';
import SharedWorkerUrl from '../../workers/supabase.shared?worker&url';

export { DbWorkerUrl, WebSocketWorkerUrl, SharedWorkerUrl };
