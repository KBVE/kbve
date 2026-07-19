export class StoreApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'StoreApiError';
		this.status = status;
		this.code = code;
	}
}
