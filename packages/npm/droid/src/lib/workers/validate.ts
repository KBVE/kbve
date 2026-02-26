import {
	ToastPayloadSchema,
	TooltipPayloadSchema,
	ModalPayloadSchema,
} from '../types/ui-event-types';
import type { z } from 'zod';

export type UIMessageType =
	| 'toast'
	| 'toast-remove'
	| 'tooltip-open'
	| 'tooltip-close'
	| 'modal-open'
	| 'modal-close';

const SCHEMAS: Partial<Record<UIMessageType, z.ZodType<unknown>>> = {
	toast: ToastPayloadSchema,
	'tooltip-open': TooltipPayloadSchema,
	'modal-open': ModalPayloadSchema,
};

export interface ValidatedWorkerMessage {
	type: UIMessageType;
	payload: unknown;
}

/**
 * Validate a UI message payload BEFORE postMessage to main thread.
 * Returns the validated message or throws with a descriptive error.
 *
 * Usage (inside worker):
 *   const msg = validateUIMessage('toast', rawPayload);
 *   emitFromWorker(msg); // guaranteed valid
 */
export function validateUIMessage(
	type: UIMessageType,
	payload: unknown,
): ValidatedWorkerMessage {
	const schema = SCHEMAS[type];
	if (schema) {
		const result = schema.safeParse(payload);
		if (!result.success) {
			throw new Error(
				`[KBVE Worker] Invalid ${type} payload: ${result.error.message}`,
			);
		}
		return { type, payload: result.data };
	}
	// Types without full schemas (toast-remove, tooltip-close, modal-close)
	// only require an id field
	if (
		type === 'toast-remove' ||
		type === 'tooltip-close' ||
		type === 'modal-close'
	) {
		if (
			!payload ||
			typeof (payload as Record<string, unknown>)['id'] !== 'string'
		) {
			throw new Error(`[KBVE Worker] ${type} requires { id: string }`);
		}
	}
	return { type, payload };
}
