import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	$activeTooltip,
	$drawerOpen,
	$modalId,
	openTooltip,
	closeTooltip,
	openDrawer,
	closeDrawer,
	openModal,
	closeModal,
} from './ui';
import { DroidEvents } from '../workers/events';

beforeEach(() => {
	$activeTooltip.set(null);
	$drawerOpen.set(false);
	$modalId.set(null);
});

describe('Tooltip state', () => {
	it('openTooltip sets the active tooltip', () => {
		openTooltip('tip-1');
		expect($activeTooltip.get()).toBe('tip-1');
	});

	it('openTooltip emits tooltip-opened event', () => {
		const handler = vi.fn();
		DroidEvents.on('tooltip-opened', handler);

		openTooltip('tip-2');

		expect(handler).toHaveBeenCalledWith({ id: 'tip-2' });
		DroidEvents.off('tooltip-opened', handler);
	});

	it('closeTooltip clears the active tooltip', () => {
		openTooltip('tip-1');
		closeTooltip();
		expect($activeTooltip.get()).toBeNull();
	});

	it('closeTooltip emits tooltip-closed event', () => {
		const handler = vi.fn();
		DroidEvents.on('tooltip-closed', handler);

		openTooltip('tip-1');
		closeTooltip();

		expect(handler).toHaveBeenCalledWith({ id: 'tip-1' });
		DroidEvents.off('tooltip-closed', handler);
	});

	it('closeTooltip with mismatched id does nothing', () => {
		openTooltip('tip-1');
		closeTooltip('tip-2');
		expect($activeTooltip.get()).toBe('tip-1');
	});

	it('closeTooltip with matching id clears tooltip', () => {
		openTooltip('tip-1');
		closeTooltip('tip-1');
		expect($activeTooltip.get()).toBeNull();
	});

	it('closeTooltip does not emit when no tooltip is active', () => {
		const handler = vi.fn();
		DroidEvents.on('tooltip-closed', handler);

		closeTooltip();

		expect(handler).not.toHaveBeenCalled();
		DroidEvents.off('tooltip-closed', handler);
	});
});

describe('Drawer state', () => {
	it('openDrawer sets drawer open and clears tooltip', () => {
		openTooltip('tip-1');
		openDrawer();
		expect($drawerOpen.get()).toBe(true);
		expect($activeTooltip.get()).toBeNull();
	});

	it('closeDrawer sets drawer closed', () => {
		openDrawer();
		closeDrawer();
		expect($drawerOpen.get()).toBe(false);
	});
});

describe('Modal state', () => {
	it('openModal sets the modal id', () => {
		openModal('modal-1');
		expect($modalId.get()).toBe('modal-1');
	});

	it('openModal closes drawer and tooltip', () => {
		openDrawer();
		openTooltip('tip-1');
		openModal('modal-1');
		expect($drawerOpen.get()).toBe(false);
		expect($activeTooltip.get()).toBeNull();
	});

	it('openModal emits modal-opened event', () => {
		const handler = vi.fn();
		DroidEvents.on('modal-opened', handler);

		openModal('modal-1');

		expect(handler).toHaveBeenCalledWith({ id: 'modal-1' });
		DroidEvents.off('modal-opened', handler);
	});

	it('closeModal clears the modal id', () => {
		openModal('modal-1');
		closeModal();
		expect($modalId.get()).toBeNull();
	});

	it('closeModal emits modal-closed event', () => {
		const handler = vi.fn();
		DroidEvents.on('modal-closed', handler);

		openModal('modal-1');
		closeModal();

		expect(handler).toHaveBeenCalledWith({ id: 'modal-1' });
		DroidEvents.off('modal-closed', handler);
	});

	it('closeModal with mismatched id does nothing', () => {
		openModal('modal-1');
		closeModal('modal-2');
		expect($modalId.get()).toBe('modal-1');
	});

	it('closeModal does not emit when no modal is active', () => {
		const handler = vi.fn();
		DroidEvents.on('modal-closed', handler);

		closeModal();

		expect(handler).not.toHaveBeenCalled();
		DroidEvents.off('modal-closed', handler);
	});
});
