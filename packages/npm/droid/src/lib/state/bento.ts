import { atom } from 'nanostores';

export type BentoStage = 'shipped' | 'arrived' | 'delivered' | 'dropped';

export interface BentoShipment {
	id: number;
	word: string;
	stage: BentoStage;
	at: number;
}

const LEDGER_MAX = 24;

let nextShipmentId = 1;

export const $bentoShipment = atom<BentoShipment | null>(null);
export const $bentoLedger = atom<readonly BentoShipment[]>([]);

function record(shipment: BentoShipment) {
	const rest = $bentoLedger.get().filter((s) => s.id !== shipment.id);
	$bentoLedger.set([...rest, shipment].slice(-LEDGER_MAX));
	$bentoShipment.set(shipment);
}

export function shipBentoWord(word: string): BentoShipment {
	const shipment: BentoShipment = {
		id: nextShipmentId++,
		word,
		stage: 'shipped',
		at: Date.now(),
	};
	record(shipment);
	return shipment;
}

export function advanceBentoShipment(
	id: number,
	stage: BentoStage,
): BentoShipment | null {
	const current = $bentoLedger.get().find((s) => s.id === id);
	if (!current || current.stage === stage) return null;
	const updated: BentoShipment = { ...current, stage, at: Date.now() };
	record(updated);
	return updated;
}

export function resetBentoFlow() {
	nextShipmentId = 1;
	$bentoShipment.set(null);
	$bentoLedger.set([]);
}
