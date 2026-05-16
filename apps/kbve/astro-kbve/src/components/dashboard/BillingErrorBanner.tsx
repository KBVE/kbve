import { motion } from 'framer-motion';
import { Coins, CreditCard } from 'lucide-react';
import { Tooltip } from './Tooltip';
import type { BillingErrorInfo } from './billingError';

export function BillingErrorBanner({ info }: { info: BillingErrorInfo }) {
	return (
		<motion.div
			initial={{ opacity: 0, y: -4 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.18 }}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: '0.75rem',
				padding: '0.65rem 0.9rem',
				background: 'rgba(245, 158, 11, 0.08)',
				border: '1px solid rgba(245, 158, 11, 0.25)',
				borderRadius: '6px',
				color: '#f59e0b',
				fontSize: '0.85rem',
			}}>
			<Coins size={18} style={{ flexShrink: 0 }} />
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontWeight: 500 }}>{info.reason}</div>
				{info.needed !== undefined && (
					<div
						style={{
							opacity: 0.8,
							fontSize: '0.75rem',
							marginTop: 2,
						}}>
						Need {info.needed.toLocaleString()} more credits to
						proceed.
					</div>
				)}
				{info.hint && (
					<div
						style={{
							opacity: 0.7,
							fontSize: '0.72rem',
							marginTop: 2,
						}}>
						{info.hint}
					</div>
				)}
			</div>
			<Tooltip content="Top-up isn't wired yet — coming soon" side="left">
				<motion.button
					type="button"
					whileHover={{ scale: 1.04 }}
					whileTap={{ scale: 0.96 }}
					transition={{ duration: 0.1 }}
					disabled
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: '0.3rem',
						padding: '0.35rem 0.75rem',
						background: 'rgba(245, 158, 11, 0.15)',
						border: '1px solid rgba(245, 158, 11, 0.35)',
						borderRadius: '5px',
						color: '#f59e0b',
						fontSize: '0.78rem',
						fontWeight: 500,
						cursor: 'not-allowed',
						opacity: 0.7,
					}}>
					<CreditCard size={12} />
					Top up credits
				</motion.button>
			</Tooltip>
		</motion.div>
	);
}
