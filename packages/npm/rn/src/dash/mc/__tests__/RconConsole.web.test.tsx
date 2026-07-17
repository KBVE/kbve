import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { RconConsole } from '../RconConsole';
import type { RconExecFn, RconExecResponse } from '../rconExec';

const OK_RESPONSE: RconExecResponse = {
	ok: true,
	output: 'done',
	latency_ms: 12,
};

describe('RconConsole.web', () => {
	it('renders tier tabs and command select for a backend server', () => {
		const exec: RconExecFn = vi.fn(async () => OK_RESPONSE);
		const { getByText, getByRole } = render(
			<RconConsole server="survival" exec={exec} />,
		);
		expect(getByText('Read')).toBeTruthy();
		expect(getByText('Write')).toBeTruthy();
		expect(getByText('Destructive')).toBeTruthy();
		const select = getByRole('combobox') as HTMLSelectElement;
		expect(select.value).toBe('list');
		expect(getByText(/List players \(list\)/)).toBeTruthy();
	});

	describe('destructive confirm gate', () => {
		let confirmSpy: ReturnType<typeof vi.spyOn>;

		beforeEach(() => {
			confirmSpy = vi.spyOn(window, 'confirm');
		});

		afterEach(() => {
			confirmSpy.mockRestore();
		});

		it('does not call exec when confirm is declined, calls it when accepted', async () => {
			confirmSpy.mockReturnValue(false);
			const exec: RconExecFn = vi.fn(async () => OK_RESPONSE);
			const { getByText, getByRole } = render(
				<RconConsole server="survival" exec={exec} />,
			);

			fireEvent.click(getByText('Destructive'));

			const select = getByRole('combobox') as HTMLSelectElement;
			fireEvent.change(select, { target: { value: 'ban' } });

			const runButton = getByText(/^Run /);
			fireEvent.click(runButton);

			await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
			expect(exec).not.toHaveBeenCalled();

			confirmSpy.mockReturnValue(true);
			fireEvent.click(getByText(/^Run /));

			await waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
			expect(exec).toHaveBeenCalledWith(
				'survival',
				expect.objectContaining({ command: 'ban' }),
			);
		});
	});
});
