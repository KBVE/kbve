import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import {
	X,
	Loader2,
	AlertTriangle,
	CheckCircle2,
	Info,
	XCircle,
	RotateCcw,
} from 'lucide-react';
import {
	forgejoService,
	type ForgejoTab,
	type ToastMsg,
	type Notice,
	type NoticeKind,
} from './forgejoService';

export function useTabActive(tab: ForgejoTab): boolean {
	return useStore(forgejoService.$activeTab) === tab;
}

const NOTICE_PALETTE: Record<
	NoticeKind,
	{ color: string; bg: string; Icon: typeof Info }
> = {
	info: { color: '#06b6d4', bg: 'rgba(6,182,212,0.1)', Icon: Info },
	warn: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', Icon: AlertTriangle },
	error: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', Icon: XCircle },
};

export function InfoBox({
	notice,
	onDismiss,
	onRetry,
}: {
	notice: Notice;
	onDismiss?: () => void;
	onRetry?: () => void;
}) {
	const p = NOTICE_PALETTE[notice.kind];
	return (
		<div
			className="not-content"
			style={{
				display: 'flex',
				alignItems: 'flex-start',
				gap: 10,
				padding: '0.7rem 0.9rem',
				borderRadius: 10,
				background: p.bg,
				border: `1px solid ${p.color}40`,
				marginBottom: '1rem',
			}}>
			<p.Icon
				size={16}
				style={{ color: p.color, flexShrink: 0, marginTop: 1 }}
			/>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div
					style={{
						color: 'var(--sl-color-text, #e6edf3)',
						fontSize: '0.82rem',
						fontWeight: 600,
					}}>
					{notice.msg}
				</div>
				{notice.detail && (
					<div
						style={{
							color: 'var(--sl-color-gray-3, #8b949e)',
							fontSize: '0.74rem',
							marginTop: 2,
							wordBreak: 'break-word',
						}}>
						{notice.detail}
					</div>
				)}
			</div>
			{onRetry && (
				<button
					type="button"
					onClick={onRetry}
					title="Retry"
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 4,
						padding: '0.2rem 0.5rem',
						borderRadius: 6,
						border: `1px solid ${p.color}55`,
						background: 'transparent',
						color: p.color,
						fontSize: '0.72rem',
						fontWeight: 600,
						cursor: 'pointer',
						flexShrink: 0,
					}}>
					<RotateCcw size={11} /> Retry
				</button>
			)}
			{onDismiss && (
				<button
					type="button"
					onClick={onDismiss}
					title="Dismiss"
					style={{
						background: 'transparent',
						border: 'none',
						color: 'var(--sl-color-gray-3, #8b949e)',
						cursor: 'pointer',
						display: 'flex',
						flexShrink: 0,
					}}>
					<X size={14} />
				</button>
			)}
		</div>
	);
}

export function ForgejoNotice({
	ctx,
	onRetry,
}: {
	ctx: string;
	onRetry?: () => void;
}) {
	const notices = useStore(forgejoService.$notices);
	const notice = notices[ctx];
	if (!notice) return null;
	return (
		<InfoBox
			notice={notice}
			onDismiss={() => forgejoService.clearNotice(ctx)}
			onRetry={onRetry}
		/>
	);
}

export function LoadMoreButton({
	hasMore,
	onClick,
}: {
	hasMore: boolean;
	onClick: () => void;
}) {
	const loading = useStore(forgejoService.$loadingMore);
	if (!hasMore) return null;
	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'center',
				marginTop: 12,
			}}>
			<button
				type="button"
				onClick={onClick}
				disabled={loading}
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					gap: 6,
					padding: '0.45rem 1rem',
					borderRadius: 8,
					border: '1px solid var(--sl-color-gray-5, #30363d)',
					background: 'var(--sl-color-gray-6, #161b22)',
					color: 'var(--sl-color-text, #e6edf3)',
					cursor: loading ? 'not-allowed' : 'pointer',
					opacity: loading ? 0.6 : 1,
					fontSize: '0.8rem',
					fontWeight: 600,
				}}>
				{loading && (
					<Loader2
						size={13}
						style={{ animation: 'spin 1s linear infinite' }}
					/>
				)}
				Load more
			</button>
		</div>
	);
}

const accent = 'var(--sl-color-accent, #06b6d4)';
const textColor = 'var(--sl-color-text, #e6edf3)';
const subText = 'var(--sl-color-gray-3, #8b949e)';
const border = '1px solid var(--sl-color-gray-5, #30363d)';
const panelBg = 'var(--sl-color-gray-6, #161b22)';

export function ActionButton({
	onClick,
	children,
	variant = 'default',
	loading = false,
	disabled = false,
	size = 'md',
	title,
}: {
	onClick?: () => void;
	children: ReactNode;
	variant?: 'default' | 'primary' | 'danger' | 'ghost';
	loading?: boolean;
	disabled?: boolean;
	size?: 'sm' | 'md';
	title?: string;
}) {
	const palette: Record<string, { bg: string; fg: string; bd: string }> = {
		default: { bg: panelBg, fg: textColor, bd: '#30363d' },
		primary: { bg: `${accent}22`, fg: accent, bd: `${accent}55` },
		danger: {
			bg: 'rgba(239,68,68,0.12)',
			fg: '#ef4444',
			bd: 'rgba(239,68,68,0.4)',
		},
		ghost: { bg: 'transparent', fg: subText, bd: 'transparent' },
	};
	const p = palette[variant];
	const isDisabled = disabled || loading;
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			disabled={isDisabled}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: 5,
				padding: size === 'sm' ? '0.25rem 0.5rem' : '0.4rem 0.75rem',
				borderRadius: 7,
				border: `1px solid ${p.bd}`,
				background: p.bg,
				color: p.fg,
				cursor: isDisabled ? 'not-allowed' : 'pointer',
				opacity: isDisabled ? 0.55 : 1,
				fontSize: size === 'sm' ? '0.7rem' : '0.78rem',
				fontWeight: 600,
				whiteSpace: 'nowrap',
				transition: 'opacity 0.15s',
			}}>
			{loading && (
				<Loader2
					size={size === 'sm' ? 11 : 13}
					style={{ animation: 'spin 1s linear infinite' }}
				/>
			)}
			{children}
		</button>
	);
}

const fieldLabel: React.CSSProperties = {
	display: 'block',
	fontSize: '0.72rem',
	fontWeight: 600,
	color: subText,
	marginBottom: 4,
	textTransform: 'uppercase',
	letterSpacing: '0.04em',
};

const inputStyle: React.CSSProperties = {
	width: '100%',
	padding: '0.45rem 0.6rem',
	borderRadius: 7,
	border,
	background: 'var(--sl-color-bg, #0d1117)',
	color: textColor,
	fontSize: '0.82rem',
	boxSizing: 'border-box',
};

export function TextField({
	label,
	value,
	onChange,
	placeholder,
	type = 'text',
	textarea = false,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	type?: string;
	textarea?: boolean;
}) {
	return (
		<label style={{ display: 'block', marginBottom: '0.75rem' }}>
			<span style={fieldLabel}>{label}</span>
			{textarea ? (
				<textarea
					value={value}
					placeholder={placeholder}
					onChange={(e) => onChange(e.target.value)}
					rows={3}
					style={{
						...inputStyle,
						resize: 'vertical',
						fontFamily: 'inherit',
					}}
				/>
			) : (
				<input
					type={type}
					value={value}
					placeholder={placeholder}
					onChange={(e) => onChange(e.target.value)}
					style={inputStyle}
				/>
			)}
		</label>
	);
}

export function SelectField({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (v: string) => void;
}) {
	return (
		<label style={{ display: 'block', marginBottom: '0.75rem' }}>
			<span style={fieldLabel}>{label}</span>
			<select
				value={value}
				onChange={(e) => onChange(e.target.value)}
				style={inputStyle}>
				{options.map((o) => (
					<option key={o.value} value={o.value}>
						{o.label}
					</option>
				))}
			</select>
		</label>
	);
}

export function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<label
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 8,
				marginBottom: '0.6rem',
				cursor: 'pointer',
				fontSize: '0.82rem',
				color: textColor,
			}}>
			<button
				type="button"
				onClick={() => onChange(!checked)}
				style={{
					width: 36,
					height: 20,
					borderRadius: 999,
					border,
					background: checked
						? accent
						: 'var(--sl-color-gray-5, #30363d)',
					position: 'relative',
					cursor: 'pointer',
					flexShrink: 0,
					transition: 'background 0.15s',
				}}>
				<span
					style={{
						position: 'absolute',
						top: 2,
						left: checked ? 18 : 2,
						width: 14,
						height: 14,
						borderRadius: '50%',
						background: '#fff',
						transition: 'left 0.15s',
					}}
				/>
			</button>
			{label}
		</label>
	);
}

export function Modal({
	title,
	onClose,
	children,
	footer,
	width = 480,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
	footer?: ReactNode;
	width?: number;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);

	return (
		<div
			onClick={onClose}
			style={{
				position: 'fixed',
				inset: 0,
				background: 'rgba(0,0,0,0.6)',
				display: 'flex',
				alignItems: 'flex-start',
				justifyContent: 'center',
				zIndex: 1000,
				padding: '4rem 1rem 1rem',
				overflowY: 'auto',
			}}>
			<div
				onClick={(e) => e.stopPropagation()}
				className="not-content"
				style={{
					width: '100%',
					maxWidth: width,
					background: 'var(--sl-color-bg-nav, #111)',
					border,
					borderRadius: 12,
					boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
				}}>
				<div
					style={{
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'space-between',
						padding: '0.85rem 1.1rem',
						borderBottom: border,
					}}>
					<h3
						style={{
							margin: 0,
							fontSize: '1rem',
							fontWeight: 600,
							color: textColor,
						}}>
						{title}
					</h3>
					<button
						type="button"
						onClick={onClose}
						style={{
							background: 'transparent',
							border: 'none',
							color: subText,
							cursor: 'pointer',
							display: 'flex',
						}}>
						<X size={18} />
					</button>
				</div>
				<div style={{ padding: '1.1rem' }}>{children}</div>
				{footer && (
					<div
						style={{
							display: 'flex',
							justifyContent: 'flex-end',
							gap: 8,
							padding: '0.85rem 1.1rem',
							borderTop: border,
						}}>
						{footer}
					</div>
				)}
			</div>
		</div>
	);
}

export function ConfirmDialog({
	title,
	message,
	confirmLabel = 'Confirm',
	danger = false,
	onConfirm,
	onCancel,
	loading = false,
	extra,
}: {
	title: string;
	message: string;
	confirmLabel?: string;
	danger?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
	loading?: boolean;
	extra?: ReactNode;
}) {
	return (
		<Modal
			title={title}
			onClose={onCancel}
			width={420}
			footer={
				<>
					<ActionButton variant="ghost" onClick={onCancel}>
						Cancel
					</ActionButton>
					<ActionButton
						variant={danger ? 'danger' : 'primary'}
						onClick={onConfirm}
						loading={loading}>
						{confirmLabel}
					</ActionButton>
				</>
			}>
			<p
				style={{
					margin: 0,
					color: textColor,
					fontSize: '0.85rem',
					lineHeight: 1.5,
				}}>
				{message}
			</p>
			{extra}
		</Modal>
	);
}

export function ForgejoToast({
	toast,
	onClose,
}: {
	toast: ToastMsg | null;
	onClose: () => void;
}) {
	if (!toast) return null;
	const map = {
		success: { color: '#22c55e', Icon: CheckCircle2 },
		error: { color: '#ef4444', Icon: AlertTriangle },
		info: { color: accent, Icon: Info },
	};
	const { color, Icon } = map[toast.kind];
	return (
		<div
			onClick={onClose}
			className="not-content"
			style={{
				position: 'fixed',
				bottom: 24,
				right: 24,
				zIndex: 1100,
				display: 'flex',
				alignItems: 'flex-start',
				gap: 10,
				maxWidth: 420,
				padding: '0.75rem 1rem',
				borderRadius: 10,
				background: 'var(--sl-color-bg-nav, #111)',
				border: `1px solid ${color}55`,
				boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
				cursor: 'pointer',
			}}>
			<Icon size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
			<span
				style={{
					color: textColor,
					fontSize: '0.82rem',
					lineHeight: 1.4,
				}}>
				{toast.msg}
			</span>
		</div>
	);
}

export function useForm<T extends Record<string, unknown>>(initial: T) {
	const [state, setState] = useState<T>(initial);
	const ref = useRef(initial);
	ref.current = state;
	const set = <K extends keyof T>(key: K, value: T[K]) =>
		setState((s) => ({ ...s, [key]: value }));
	const reset = () => setState(initial);
	return { state, set, reset };
}

export const uiTokens = { accent, textColor, subText, border, panelBg };
