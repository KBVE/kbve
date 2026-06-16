import { request } from '../net';
import type { RequestOptions, RequestResult } from '../net';
import type { paths } from './schema';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete';

type MethodMap = {
	get: 'GET';
	post: 'POST';
	put: 'PUT';
	delete: 'DELETE';
};

type PathsWith<M extends HttpMethod> = {
	[P in keyof paths]: paths[P] extends Record<M, infer Op>
		? Op extends undefined | never
			? never
			: P
		: never;
}[keyof paths];

type Op<P extends keyof paths, M extends HttpMethod> =
	paths[P] extends Record<M, infer O> ? O : never;

type SuccessOf<O> = O extends { responses: infer R }
	? R extends { 200: { content: { 'application/json': infer D } } }
		? D
		: R extends { 201: { content: { 'application/json': infer D } } }
			? D
			: unknown
	: unknown;

type BodyOf<O> = O extends {
	requestBody: { content: { 'application/json': infer B } };
}
	? B
	: O extends {
				requestBody?: { content: { 'application/json': infer B } };
		  }
		? B | undefined
		: undefined;

type PathParamsOf<O> = O extends { parameters: { path: infer P } }
	? P extends Record<string, unknown>
		? P
		: undefined
	: undefined;

type QueryParamsOf<O> = O extends { parameters: { query?: infer Q } }
	? Q extends Record<string, unknown>
		? Q
		: undefined
	: undefined;

export interface CallInit<O> {
	path?: PathParamsOf<O>;
	query?: QueryParamsOf<O>;
	body?: BodyOf<O>;
	options?: Omit<RequestOptions, 'method' | 'body'>;
}

export interface ApiClientConfig {
	baseUrl: string;
	getToken?: () =>
		| string
		| null
		| undefined
		| Promise<string | null | undefined>;
	defaultOptions?: Omit<RequestOptions, 'method' | 'body'>;
}

const METHOD: MethodMap = {
	get: 'GET',
	post: 'POST',
	put: 'PUT',
	delete: 'DELETE',
};

function fillPath(template: string, params?: Record<string, unknown>): string {
	if (!params) return template;
	return template.replace(/\{([^}]+)\}/g, (_, key: string) =>
		encodeURIComponent(String(params[key] ?? '')),
	);
}

function buildQuery(query?: Record<string, unknown>): string {
	if (!query) return '';
	const pairs: string[] = [];
	for (const [key, value] of Object.entries(query)) {
		if (value === undefined || value === null) continue;
		pairs.push(
			`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`,
		);
	}
	return pairs.length ? `?${pairs.join('&')}` : '';
}

export interface ApiClient {
	get<P extends PathsWith<'get'>>(
		path: P,
		init?: CallInit<Op<P, 'get'>>,
	): Promise<RequestResult<SuccessOf<Op<P, 'get'>>>>;
	post<P extends PathsWith<'post'>>(
		path: P,
		init?: CallInit<Op<P, 'post'>>,
	): Promise<RequestResult<SuccessOf<Op<P, 'post'>>>>;
	put<P extends PathsWith<'put'>>(
		path: P,
		init?: CallInit<Op<P, 'put'>>,
	): Promise<RequestResult<SuccessOf<Op<P, 'put'>>>>;
	del<P extends PathsWith<'delete'>>(
		path: P,
		init?: CallInit<Op<P, 'delete'>>,
	): Promise<RequestResult<SuccessOf<Op<P, 'delete'>>>>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
	const base = config.baseUrl.replace(/\/$/, '');

	async function call(
		method: HttpMethod,
		template: string,
		init?: CallInit<unknown>,
	): Promise<RequestResult<unknown>> {
		const url =
			base +
			fillPath(
				template,
				init?.path as unknown as Record<string, unknown> | undefined,
			) +
			buildQuery(
				init?.query as unknown as Record<string, unknown> | undefined,
			);

		const token = config.getToken ? await config.getToken() : null;
		const headers: Record<string, string> = {
			...(config.defaultOptions?.headers ?? {}),
			...(init?.options?.headers ?? {}),
		};
		if (token) headers['Authorization'] = `Bearer ${token}`;

		return request(url, {
			...config.defaultOptions,
			...init?.options,
			method: METHOD[method],
			headers,
			body: init?.body,
		});
	}

	return {
		get: (path, init) =>
			call('get', path as string, init as CallInit<unknown>) as never,
		post: (path, init) =>
			call('post', path as string, init as CallInit<unknown>) as never,
		put: (path, init) =>
			call('put', path as string, init as CallInit<unknown>) as never,
		del: (path, init) =>
			call('delete', path as string, init as CallInit<unknown>) as never,
	};
}
