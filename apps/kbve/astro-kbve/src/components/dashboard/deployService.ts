import { atom } from 'nanostores';

// ---------------------------------------------------------------------------
// Types — mirror firecracker-ctl's DeployFcRequest + PersistentEndpointInfo
// ---------------------------------------------------------------------------

export type EndpointVisibility = 'staff' | 'public';

export interface RateLimitConfig {
	requests_per_sec?: number;
	burst?: number;
}

export interface EndpointHttpConfig {
	cors_allow_origins?: string[];
	cors_allow_methods?: string[];
	cors_allow_headers?: string[];
	cors_max_age_secs?: number;
	cors_allow_credentials?: boolean;
	inject_request_headers?: Record<string, string>;
	rate_limit?: RateLimitConfig;
}

export interface DeployRequest {
	name: string;
	rootfs: string;
	http_port: number;
	entrypoint: string;
	vcpu_count?: number;
	mem_size_mib?: number;
	health_path?: string;
	env?: Record<string, unknown>;
	code?: string;
	visibility?: EndpointVisibility;
	idle_ttl_secs?: number;
	http_config?: EndpointHttpConfig;
}

export interface DeployedEndpoint {
	name: string;
	vm_id: string;
	rootfs: string;
	ip: string;
	http_port: number;
	entrypoint: string;
	status?: string;
	created_at?: string;
	visibility?: EndpointVisibility;
	idle_ttl_secs?: number;
	http_config?: EndpointHttpConfig;
}

export interface DeployTemplate {
	id: string;
	label: string;
	rootfs: string;
	language: 'python' | 'javascript';
	http_port: number;
	entrypoint: string;
	vcpu_count: number;
	mem_size_mib: number;
	default_code: string;
}

export type DeployPhase = 'idle' | 'submitting' | 'ready' | 'failed';

// ---------------------------------------------------------------------------
// Template inventory
// ---------------------------------------------------------------------------

const PYTHON_FASTAPI_CODE = `from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
def root():
    return {"hello": "world"}

@app.get("/health")
def health():
    return {"ok": True}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
`;

const NODE_FASTIFY_CODE = `const Fastify = require('fastify');
const app = Fastify({ logger: true });

app.get('/', async () => ({ hello: 'world' }));
app.get('/health', async () => ({ ok: true }));

app
  .listen({ host: '0.0.0.0', port: 8080 })
  .then((addr) => app.log.info(\`listening on \${addr}\`))
  .catch((err) => { app.log.error(err); process.exit(1); });
`;

export const TEMPLATES: DeployTemplate[] = [
	{
		id: 'python-web-baked',
		label: 'Python · FastAPI (baked)',
		rootfs: 'firecracker-python-web',
		language: 'python',
		http_port: 8080,
		entrypoint: 'python3 /tmp/code',
		vcpu_count: 1,
		mem_size_mib: 256,
		default_code: PYTHON_FASTAPI_CODE,
	},
	{
		id: 'python-fastapi-cache',
		label: 'Python · FastAPI (cache)',
		rootfs: 'alpine-python',
		language: 'python',
		http_port: 8080,
		entrypoint: 'python3 /tmp/code',
		vcpu_count: 1,
		mem_size_mib: 256,
		default_code: PYTHON_FASTAPI_CODE,
	},
	{
		id: 'node-web-baked',
		label: 'Node · Fastify (baked)',
		rootfs: 'firecracker-node-web',
		language: 'javascript',
		http_port: 8080,
		entrypoint: 'node /tmp/code',
		vcpu_count: 1,
		mem_size_mib: 256,
		default_code: NODE_FASTIFY_CODE,
	},
	{
		id: 'node-fastify-cache',
		label: 'Node · Fastify (cache)',
		rootfs: 'alpine-node',
		language: 'javascript',
		http_port: 8080,
		entrypoint: 'node /tmp/code',
		vcpu_count: 1,
		mem_size_mib: 256,
		default_code: NODE_FASTIFY_CODE,
	},
];

// Cache-tier templates need explicit packages so the init script knows
// what to install from the pip/npm cache drive.
export const TEMPLATE_PACKAGES: Record<string, string[]> = {
	'python-fastapi-cache': ['fastapi', 'uvicorn'],
	'node-fastify-cache': ['fastify'],
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const FC_BASE = '/api/v1/fc';

async function fcFetch<T>(
	token: string,
	path: string,
	method = 'GET',
	body?: unknown,
): Promise<T> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${token}`,
	};
	const opts: RequestInit = {
		method,
		headers,
		signal: AbortSignal.timeout(20000),
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
		opts.body = JSON.stringify(body);
	}
	const resp = await fetch(`${FC_BASE}${path}`, opts);
	if (!resp.ok) {
		const text = await resp.text().catch(() => '');
		throw new Error(`fc ${resp.status}: ${text.slice(0, 300)}`);
	}
	const text = await resp.text();
	if (!text.trim()) return {} as T;
	return JSON.parse(text) as T;
}

function endpointUrl(name: string): string {
	return `/dashboard/firecracker-net/proxy/proxy/${name}/`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

class DeployService {
	public readonly $phase = atom<DeployPhase>('idle');
	public readonly $error = atom<string | null>(null);
	public readonly $template = atom<DeployTemplate>(TEMPLATES[0]);
	public readonly $name = atom<string>('');
	public readonly $code = atom<string>(TEMPLATES[0].default_code);
	public readonly $port = atom<number>(TEMPLATES[0].http_port);
	public readonly $endpoints = atom<DeployedEndpoint[]>([]);
	public readonly $lastDeployedName = atom<string | null>(null);
	public readonly $visibility = atom<EndpointVisibility>('staff');
	public readonly $corsOriginsRaw = atom<string>('');
	public readonly $rateRps = atom<number>(0);
	public readonly $rateBurst = atom<number>(0);
	public readonly $idleTtlSecs = atom<number>(0);
	public readonly $injectHeadersRaw = atom<string>('');

	public selectTemplate(id: string): void {
		const tpl = TEMPLATES.find((t) => t.id === id);
		if (!tpl) return;
		this.$template.set(tpl);
		this.$port.set(tpl.http_port);
		const current = this.$code.get();
		const wasDefault = TEMPLATES.some(
			(t) => t.default_code.trim() === current.trim(),
		);
		if (wasDefault) {
			this.$code.set(tpl.default_code);
		}
	}

	public urlFor(name: string): string {
		return endpointUrl(name);
	}

	public publicUrlFor(name: string): string {
		return `/fc/public/${name}/`;
	}

	private parseInjectHeaders(
		raw: string,
	): Record<string, string> | undefined {
		const out: Record<string, string> = {};
		let count = 0;
		for (const line of raw.split('\n')) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const idx = trimmed.indexOf(':');
			if (idx <= 0) {
				throw new Error(
					`Invalid header line (expected "Name: value"): ${trimmed}`,
				);
			}
			const key = trimmed.slice(0, idx).trim();
			const value = trimmed.slice(idx + 1).trim();
			if (!key || !value) {
				throw new Error(`Invalid header line: ${trimmed}`);
			}
			out[key] = value;
			count += 1;
			if (count > 16) {
				throw new Error('Inject headers limit (16) exceeded.');
			}
		}
		return Object.keys(out).length > 0 ? out : undefined;
	}

	private buildHttpConfig(): EndpointHttpConfig | undefined {
		const originsRaw = this.$corsOriginsRaw.get().trim();
		const corsOrigins = originsRaw
			? originsRaw
					.split(/[\s,]+/)
					.map((s) => s.trim())
					.filter(Boolean)
			: [];
		const injectHeaders = this.parseInjectHeaders(
			this.$injectHeadersRaw.get(),
		);
		const rps = Math.max(0, Math.floor(this.$rateRps.get() ?? 0));
		const burst = Math.max(0, Math.floor(this.$rateBurst.get() ?? 0));

		const cfg: EndpointHttpConfig = {};
		let any = false;
		if (corsOrigins.length > 0) {
			cfg.cors_allow_origins = corsOrigins;
			any = true;
		}
		if (injectHeaders) {
			cfg.inject_request_headers = injectHeaders;
			any = true;
		}
		if (rps > 0 || burst > 0) {
			cfg.rate_limit = { requests_per_sec: rps, burst };
			any = true;
		}
		return any ? cfg : undefined;
	}

	public async deploy(token: string): Promise<void> {
		const tpl = this.$template.get();
		const name = this.$name.get().trim().toLowerCase();
		const code = this.$code.get();
		const port = this.$port.get();

		if (!name || !/^[a-z0-9][a-z0-9-_]{1,38}$/.test(name)) {
			this.$error.set(
				'Name must be 2–39 chars, lowercase alphanumeric / hyphen / underscore.',
			);
			return;
		}
		if (!code.trim()) {
			this.$error.set('No code to deploy.');
			return;
		}
		if (!port || port < 1024 || port > 65535) {
			this.$error.set('Port must be between 1024 and 65535.');
			return;
		}

		this.$phase.set('submitting');
		this.$error.set(null);

		let httpConfig: EndpointHttpConfig | undefined;
		try {
			httpConfig = this.buildHttpConfig();
		} catch (e) {
			this.$phase.set('idle');
			this.$error.set(e instanceof Error ? e.message : String(e));
			return;
		}

		const visibility = this.$visibility.get();
		const idleTtl = Math.max(0, Math.floor(this.$idleTtlSecs.get() ?? 0));

		const req: DeployRequest = {
			name,
			rootfs: tpl.rootfs,
			http_port: port,
			entrypoint: tpl.entrypoint,
			vcpu_count: tpl.vcpu_count,
			mem_size_mib: tpl.mem_size_mib,
			code,
			env: {},
			visibility,
		};
		if (idleTtl > 0) req.idle_ttl_secs = idleTtl;
		if (httpConfig) req.http_config = httpConfig;

		const packages = TEMPLATE_PACKAGES[tpl.id];
		if (packages && packages.length > 0) {
			(req as unknown as Record<string, unknown>).packages = packages;
		}

		try {
			await fcFetch<DeployedEndpoint>(token, '/deploy', 'POST', req);
			this.$phase.set('ready');
			this.$lastDeployedName.set(name);
			void this.refresh(token);
		} catch (err) {
			this.$phase.set('failed');
			this.$error.set(err instanceof Error ? err.message : String(err));
		}
	}

	public async refresh(token: string): Promise<void> {
		try {
			const list = await fcFetch<
				{ endpoints?: DeployedEndpoint[] } | DeployedEndpoint[]
			>(token, '/list');
			const arr = Array.isArray(list)
				? list
				: Array.isArray(list?.endpoints)
					? list.endpoints
					: [];
			this.$endpoints.set(arr);
		} catch (err) {
			this.$error.set(err instanceof Error ? err.message : String(err));
		}
	}

	public async stop(token: string, name: string): Promise<void> {
		try {
			await fcFetch(token, `/${encodeURIComponent(name)}`, 'DELETE');
			void this.refresh(token);
		} catch (err) {
			this.$error.set(err instanceof Error ? err.message : String(err));
		}
	}
}

export const deployService = new DeployService();
