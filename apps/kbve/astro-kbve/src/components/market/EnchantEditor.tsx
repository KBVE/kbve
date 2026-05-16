import { useMemo } from 'react';
import { VANILLA_ENCHANTS, enchantDef, type Enchant } from './enchants';

type Props = {
	value: Enchant[];
	onChange: (next: Enchant[]) => void;
	disabled?: boolean;
};

const SORTED = [...VANILLA_ENCHANTS].sort((a, b) =>
	a.label.localeCompare(b.label),
);

export function EnchantEditor({ value, onChange, disabled }: Props) {
	const used = useMemo(() => new Set(value.map((e) => e.id)), [value]);

	const add = () => {
		const next = SORTED.find((e) => !used.has(e.id));
		if (!next) return;
		onChange([...value, { id: next.id, level: 1 }]);
	};

	const remove = (idx: number) => {
		onChange(value.filter((_, i) => i !== idx));
	};

	const update = (idx: number, patch: Partial<Enchant>) => {
		onChange(value.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
	};

	return (
		<div className="kbve-enchant-editor">
			<div className="kbve-enchant-editor__head">
				<span className="kbve-enchant-editor__label">
					Enchantments (optional)
				</span>
				<button
					type="button"
					className="kbve-market__btn kbve-enchant-editor__add"
					onClick={add}
					disabled={disabled || used.size >= SORTED.length}>
					+ Add enchant
				</button>
			</div>
			{value.length === 0 && (
				<p className="kbve-market__hint">
					No enchants. Click "Add enchant" if this item carries one.
				</p>
			)}
			{value.map((e, i) => {
				const def = enchantDef(e.id);
				const maxLevel = def?.maxLevel ?? 5;
				return (
					<div key={i} className="kbve-enchant-editor__row">
						<select
							className="kbve-market__input"
							value={e.id}
							onChange={(ev) =>
								update(i, { id: ev.target.value, level: 1 })
							}
							disabled={disabled}>
							{SORTED.map((opt) => (
								<option
									key={opt.id}
									value={opt.id}
									disabled={
										opt.id !== e.id && used.has(opt.id)
									}>
									{opt.label}
								</option>
							))}
						</select>
						<select
							className="kbve-market__input kbve-enchant-editor__level"
							value={e.level}
							onChange={(ev) =>
								update(i, {
									level: Math.max(
										1,
										Math.min(
											maxLevel,
											Number(ev.target.value) || 1,
										),
									),
								})
							}
							disabled={disabled || maxLevel === 1}>
							{Array.from({ length: maxLevel }, (_, lvl) => (
								<option key={lvl + 1} value={lvl + 1}>
									Level {lvl + 1}
								</option>
							))}
						</select>
						<button
							type="button"
							className="kbve-market__btn kbve-market__btn--danger kbve-enchant-editor__remove"
							onClick={() => remove(i)}
							disabled={disabled}
							aria-label={`Remove ${def?.label ?? e.id}`}>
							×
						</button>
					</div>
				);
			})}
		</div>
	);
}

export default EnchantEditor;
