import {
	cloneElement,
	useCallback,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactElement,
	type ReactNode,
	type Ref,
} from 'react';
import { useStore } from '@nanostores/react';
import { $activeTooltip, openTooltip, closeTooltip } from '@kbve/droid';
import { motion, AnimatePresence } from 'framer-motion';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface TooltipProps {
	content: ReactNode;
	side?: Side;
	delay?: number;
	disabled?: boolean;
	className?: string;
	children: ReactElement<
		Record<string, unknown> & { ref?: Ref<HTMLElement> }
	>;
}

const OFFSET = 8;

function translateFor(side: Side): string {
	switch (side) {
		case 'top':
			return 'translate(-50%, -100%)';
		case 'bottom':
			return 'translate(-50%, 0)';
		case 'left':
			return 'translate(-100%, -50%)';
		case 'right':
			return 'translate(0, -50%)';
	}
}

export function Tooltip({
	content,
	side = 'top',
	delay = 150,
	disabled = false,
	className,
	children,
}: TooltipProps) {
	const id = useId();
	const active = useStore($activeTooltip);
	const isOpen = !disabled && active === id;
	const triggerRef = useRef<HTMLElement | null>(null);
	const timer = useRef<number>(0);
	const [coords, setCoords] = useState({ x: 0, y: 0 });

	const computePos = useCallback(() => {
		const el = triggerRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		let x = r.left + r.width / 2;
		let y = r.top;
		switch (side) {
			case 'top':
				y = r.top - OFFSET;
				break;
			case 'bottom':
				y = r.bottom + OFFSET;
				break;
			case 'left':
				x = r.left - OFFSET;
				y = r.top + r.height / 2;
				break;
			case 'right':
				x = r.right + OFFSET;
				y = r.top + r.height / 2;
				break;
		}
		setCoords({ x, y });
	}, [side]);

	const handleEnter = useCallback(() => {
		if (disabled) return;
		window.clearTimeout(timer.current);
		timer.current = window.setTimeout(() => {
			computePos();
			openTooltip(id);
		}, delay);
	}, [id, delay, disabled, computePos]);

	const handleLeave = useCallback(() => {
		window.clearTimeout(timer.current);
		closeTooltip(id);
	}, [id]);

	useEffect(() => {
		if (!isOpen) return;
		const onScroll = () => closeTooltip(id);
		const onResize = () => computePos();
		window.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onResize);
		return () => {
			window.removeEventListener('scroll', onScroll, true);
			window.removeEventListener('resize', onResize);
		};
	}, [isOpen, id, computePos]);

	useEffect(
		() => () => {
			window.clearTimeout(timer.current);
		},
		[],
	);

	const trigger = cloneElement(children, {
		ref: (node: HTMLElement | null) => {
			triggerRef.current = node;
			const original = (
				children as ReactElement<{ ref?: Ref<HTMLElement> }>
			).props.ref;
			if (typeof original === 'function') {
				original(node);
			} else if (
				original &&
				typeof original === 'object' &&
				'current' in original
			) {
				(original as { current: HTMLElement | null }).current = node;
			}
		},
		onMouseEnter: handleEnter,
		onMouseLeave: handleLeave,
		onFocus: handleEnter,
		onBlur: handleLeave,
	});

	return (
		<>
			{trigger}
			<AnimatePresence>
				{isOpen && (
					<motion.div
						role="tooltip"
						initial={{ opacity: 0, scale: 0.95 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.95 }}
						transition={{ duration: 0.12, ease: 'easeOut' }}
						style={{
							position: 'fixed',
							left: coords.x,
							top: coords.y,
							transform: translateFor(side),
							zIndex: 9999,
							pointerEvents: 'none',
						}}
						className={
							className ??
							'px-2 py-1 text-xs font-medium bg-zinc-900 text-zinc-100 rounded-md shadow-lg border border-zinc-700/70 whitespace-nowrap'
						}>
						{content}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
