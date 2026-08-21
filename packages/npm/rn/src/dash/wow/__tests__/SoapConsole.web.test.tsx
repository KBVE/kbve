import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { RconConsole } from '../../mc';
import { NODE_SCOPE_DETAIL, NODE_SCOPE_NOTE, WOW_COMMANDS } from '../commands';
import { soapResultCaveat } from '../soapExec';
import type { SoapExecFn, SoapExecResponse } from '../soapExec';

const console_ = (exec: SoapExecFn) => (
	<RconConsole
		server="Azeroth"
		exec={exec}
		commands={WOW_COMMANDS}
		protocolLabel="SOAP"
		resultCaveat={soapResultCaveat}
	/>
);

const ok = (over: Partial<SoapExecResponse> = {}): SoapExecResponse => ({
	ok: true,
	output: 'done',
	latency_ms: 3,
	...over,
});

describe('RconConsole with the WoW SOAP table', () => {
	it('renders the SOAP protocol label and the wow read commands', () => {
		const exec: SoapExecFn = vi.fn(async () => ok());
		const { getByText, getByRole } = render(console_(exec));
		expect(getByText('SOAP · Azeroth')).toBeTruthy();
		expect((getByRole('combobox') as HTMLSelectElement).value).toBe(
			'server_info',
		);
	});

	it('marks node-scoped commands in the picker before anything is run', () => {
		const exec: SoapExecFn = vi.fn(async () => ok());
		const { getByText, getAllByText } = render(console_(exec));
		expect(getByText(/Server info \(server_info\) · one node/)).toBeTruthy();
		expect(getAllByText(NODE_SCOPE_NOTE).length).toBeGreaterThan(0);
		expect(getByText(NODE_SCOPE_DETAIL)).toBeTruthy();
	});

	it('a realm-scoped command shows no node caveat in the picker', () => {
		const exec: SoapExecFn = vi.fn(async () => ok());
		const { getByText, getByRole, queryByText } = render(console_(exec));
		fireEvent.click(getByText('Write'));
		fireEvent.change(getByRole('combobox'), {
			target: { value: 'account_set_gmlevel' },
		});
		expect(queryByText(NODE_SCOPE_DETAIL)).toBeNull();
	});

	it('renders a warning caveat on a SUCCESSFUL node-scoped result', async () => {
		const exec: SoapExecFn = vi.fn(async () =>
			ok({ output: 'AC rev 1234', scope: 'node' }),
		);
		const { getByText, getAllByText } = render(console_(exec));
		fireEvent.click(getByText(/^Run /));
		await waitFor(() => expect(getByText('AC rev 1234')).toBeTruthy());
		expect(getAllByText('partial scope').length).toBe(1);
		expect(getByText('3ms')).toBeTruthy();
	});

	it('renders the caveat on a negative node-scoped result without calling it an error', async () => {
		const exec: SoapExecFn = vi.fn(async () =>
			ok({ ok: false, output: 'Player not found', scope: 'node' }),
		);
		const { getByText } = render(console_(exec));
		fireEvent.click(getByText('Destructive'));
		fireEvent.change(getByText('Kick player (kick) · one node').closest(
			'select',
		) as HTMLSelectElement, { target: { value: 'kick' } });
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		fireEvent.click(getByText(/^Run /));
		await waitFor(() => expect(getByText('partial scope')).toBeTruthy());
	});

	it('a realm-scoped result carries no caveat', async () => {
		const exec: SoapExecFn = vi.fn(async () =>
			ok({ output: 'banned', scope: 'realm' }),
		);
		const { getByText, getByRole, queryByText } = render(console_(exec));
		fireEvent.click(getByText('Write'));
		fireEvent.change(getByRole('combobox'), {
			target: { value: 'account_set_gmlevel' },
		});
		fireEvent.click(getByText(/^Run /));
		await waitFor(() => expect(getByText('banned')).toBeTruthy());
		expect(queryByText('partial scope')).toBeNull();
	});

	describe('destructive gate', () => {
		let confirmSpy: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			confirmSpy = vi.spyOn(window, 'confirm');
		});
		afterEach(() => confirmSpy.mockRestore());

		it('gates a destructive ban behind confirm', async () => {
			confirmSpy.mockReturnValue(false);
			const exec: SoapExecFn = vi.fn(async () => ok({ scope: 'realm' }));
			const { getByText, getByRole } = render(console_(exec));
			fireEvent.click(getByText('Destructive'));
			fireEvent.change(getByRole('combobox'), {
				target: { value: 'ban_account' },
			});
			fireEvent.click(getByText(/^Run /));
			await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
			expect(exec).not.toHaveBeenCalled();

			confirmSpy.mockReturnValue(true);
			fireEvent.click(getByText(/^Run /));
			await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
			expect(exec).toHaveBeenCalledWith(
				'Azeroth',
				expect.objectContaining({ command: 'ban_account' }),
			);
		});
	});
});
