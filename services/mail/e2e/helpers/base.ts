export const BASE_URL =
	process.env['MAIL_E2E_BASE_URL'] ?? 'http://127.0.0.1:15600';

export function url(path: string): string {
	return `${BASE_URL}${path}`;
}
