import type { SelectProps } from './Select.types';
import { tokens } from '../theme';

export function Select<T extends string>({
	value, options, placeholder, disabled, onValueChange,
}: SelectProps<T>) {
	return (
		<select
			value={value ?? ''}
			disabled={disabled}
			onChange={(e) => onValueChange(e.target.value as T)}
			style={{
				color: tokens.color.text,
				background: tokens.color.surface,
				border: `1px solid ${tokens.color.border}`,
				borderRadius: tokens.radius.md,
				padding: '6px 10px',
				fontSize: 13,
			}}>
			{placeholder ? <option value="" disabled>{placeholder}</option> : null}
			{options.map((o) => (
				<option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
			))}
		</select>
	);
}
export type { SelectProps, SelectOption } from './Select.types';
