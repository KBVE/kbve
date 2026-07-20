export class MarketApiError extends Error {
	status: number;
	code?: string;
	constructor(message: string, status: number, code?: string) {
		super(message);
		this.name = 'MarketApiError';
		this.status = status;
		this.code = code;
	}
}
