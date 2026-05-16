import { enchantDef, formatEnchant, parseEnchants } from './enchants';

type Props = {
	itemRef: unknown;
	compact?: boolean;
};

export function EnchantList({ itemRef, compact = false }: Props) {
	const enchants = parseEnchants(itemRef);
	if (enchants.length === 0) return null;
	if (compact) {
		return (
			<span
				className="kbve-enchant-marker"
				title={enchants.map(formatEnchant).join(', ')}>
				✨{' '}
				<span className="kbve-enchant-marker__count">
					{enchants.length}
				</span>
			</span>
		);
	}
	return (
		<ul className="kbve-enchant-list" aria-label="Enchantments">
			{enchants.map((e, i) => {
				const def = enchantDef(e.id);
				const cls = ['kbve-enchant-chip'];
				if (def?.curse) cls.push('kbve-enchant-chip--curse');
				if (def?.treasure) cls.push('kbve-enchant-chip--treasure');
				return (
					<li key={`${e.id}-${i}`} className={cls.join(' ')}>
						{formatEnchant(e)}
					</li>
				);
			})}
		</ul>
	);
}

export default EnchantList;
