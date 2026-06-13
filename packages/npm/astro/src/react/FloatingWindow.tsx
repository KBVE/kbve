import {
	useCallback,
	useMemo,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../utils/cn';
import { useDraggable, type Position } from '../hooks/useDraggable';
import { useResizable, type Size } from '../hooks/useResizable';

let zCounter = 50;
function nextZ(): number {
	zCounter += 1;
	return zCounter;
}

interface Persisted extends Position, Partial<Size> {}

function loadPersisted(key?: string): Persisted | null {
	if (!key || typeof window === 'undefined') return null;
	try {
		const raw = window.localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as Persisted) : null;
	} catch {
		return null;
	}
}

function savePersisted(key: string | undefined, value: Persisted): void {
	if (!key || typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage full or blocked — position just won't persist */
	}
}

export interface FloatingWindowProps {
	title?: ReactNode;
	children?: ReactNode;
	initial?: Position;
	size?: Size;
	minWidth?: number;
	minHeight?: number;
	draggable?: boolean;
	resizable?: boolean;
	/** Show a close button in the header and fire this when clicked. */
	onClose?: () => void;
	/** Extra header content rendered between the title and the close button. */
	headerActions?: ReactNode;
	/** Persist position + size under this localStorage key. */
	storageKey?: string;
	/** Render into document.body instead of in place. */
	portal?: boolean;
	className?: string;
	bodyClassName?: string;
	style?: CSSProperties;
}

/**
 * Starlight-safe floating panel: drag by the title bar, resize from the
 * bottom-right grip, click to bring forward, optionally persist geometry. The
 * `.not-content` class is baked in so Starlight prose styles never leak in.
 */
export function FloatingWindow({
	title,
	children,
	initial = { x: 24, y: 24 },
	size: sizeProp = { width: 320, height: 240 },
	minWidth = 200,
	minHeight = 120,
	draggable = true,
	resizable = true,
	onClose,
	headerActions,
	storageKey,
	portal = false,
	className,
	bodyClassName,
	style,
}: FloatingWindowProps) {
	const persisted = useMemo(() => loadPersisted(storageKey), [storageKey]);
	const panelRef = useRef<HTMLDivElement>(null);
	const [z, setZ] = useState<number>(() => nextZ());
	const bringForward = useCallback(() => setZ(nextZ()), []);

	const clamp = useCallback((p: Position): Position => {
		if (typeof window === 'undefined') return p;
		const el = panelRef.current;
		const w = el?.offsetWidth ?? 0;
		const headerH = 36;
		return {
			x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - w)),
			y: Math.min(
				Math.max(0, p.y),
				Math.max(0, window.innerHeight - headerH),
			),
		};
	}, []);

	const {
		position,
		dragging,
		handleProps: dragHandle,
	} = useDraggable({
		initial: persisted ? { x: persisted.x, y: persisted.y } : initial,
		disabled: !draggable,
		clamp,
		onStart: bringForward,
		onChange: (p) =>
			savePersisted(storageKey, {
				...p,
				width: size.width,
				height: size.height,
			}),
	});

	const {
		size,
		resizing,
		handleProps: resizeHandle,
	} = useResizable({
		initial:
			persisted && persisted.width && persisted.height
				? { width: persisted.width, height: persisted.height }
				: sizeProp,
		minWidth,
		minHeight,
		disabled: !resizable,
		onStart: bringForward,
		onChange: (s) => savePersisted(storageKey, { ...position, ...s }),
	});

	const frameStyle: CSSProperties = {
		position: 'fixed',
		left: position.x,
		top: position.y,
		width: size.width,
		height: resizable ? size.height : undefined,
		zIndex: z,
		display: 'flex',
		flexDirection: 'column',
		borderRadius: 12,
		overflow: 'hidden',
		border: '1px solid rgba(255,255,255,0.1)',
		background: 'rgba(0,0,0,0.6)',
		boxShadow: '0 20px 40px -12px rgba(0,0,0,0.5)',
		backdropFilter: 'blur(12px)',
		color: 'var(--sl-color-text, #f4f4f5)',
		userSelect: dragging || resizing ? 'none' : undefined,
		...style,
	};

	const frame = (
		<div
			ref={panelRef}
			className={cn('not-content', className)}
			style={frameStyle}
			onPointerDown={bringForward}>
			<div
				{...dragHandle}
				style={{
					...dragHandle.style,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 8,
					padding: '6px 10px',
					borderBottom: '1px solid rgba(255,255,255,0.06)',
					flex: '0 0 auto',
				}}>
				<span
					style={{
						fontSize: '0.7rem',
						fontWeight: 600,
						textTransform: 'uppercase',
						letterSpacing: '0.08em',
						color: 'var(--sl-color-text-accent, #fcd34d)',
						overflow: 'hidden',
						textOverflow: 'ellipsis',
						whiteSpace: 'nowrap',
					}}>
					{title}
				</span>
				<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					{headerActions}
					{onClose && (
						<button
							type="button"
							onClick={onClose}
							onPointerDown={(e) => e.stopPropagation()}
							aria-label="Close"
							style={{
								background: 'none',
								border: 'none',
								color: 'var(--sl-color-gray-3, #a1a1aa)',
								cursor: 'pointer',
								fontSize: 14,
								lineHeight: 1,
								padding: 2,
							}}>
							&#x2715;
						</button>
					)}
				</span>
			</div>
			<div
				className={bodyClassName}
				style={{ flex: '1 1 auto', minHeight: 0, overflow: 'auto' }}>
				{children}
			</div>
			{resizable && (
				<div
					{...resizeHandle}
					style={{
						...resizeHandle.style,
						position: 'absolute',
						right: 0,
						bottom: 0,
						width: 14,
						height: 14,
						borderRight: '2px solid rgba(255,255,255,0.25)',
						borderBottom: '2px solid rgba(255,255,255,0.25)',
						borderBottomRightRadius: 10,
					}}
				/>
			)}
		</div>
	);

	if (portal && typeof document !== 'undefined') {
		return createPortal(frame, document.body);
	}
	return frame;
}
