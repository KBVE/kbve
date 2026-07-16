import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Select } from '../Select.web';

describe('Select.web', () => {
	it('renders options and fires onValueChange', () => {
		const onChange = vi.fn();
		const { getByRole } = render(
			<Select
				value="a"
				options={[{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]}
				onValueChange={onChange}
			/>,
		);
		const select = getByRole('combobox') as HTMLSelectElement;
		fireEvent.change(select, { target: { value: 'b' } });
		expect(onChange).toHaveBeenCalledWith('b');
	});
});
