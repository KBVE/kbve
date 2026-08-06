import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { statusColor, statusLabel, type ServiceStatus } from './homeService';
import './homeServiceCards.css';

const STATUS_ICON: Record<ServiceStatus, IconName> = {
	loading: 'loader',
	ok: 'check',
	error: 'error',
	unavailable: 'warn',
};

export function StatusDot({ status }: { status: ServiceStatus }) {
	const color = statusColor(status);
	return (
		<span
			className={`svc-dot${status === 'ok' ? ' svc-dot--ok' : ''}`}
			style={{ '--svc-dot': color } as CSSProperties}
		/>
	);
}

export function MetricValue({
	label,
	value,
	unit,
	color,
}: {
	label: string;
	value: string | number;
	unit?: string;
	color?: string;
}) {
	return (
		<div className="svc-metric">
			<div
				className="svc-metric__value"
				style={
					color
						? ({ '--svc-metric': color } as CSSProperties)
						: undefined
				}>
				{value}
				{unit && <span className="svc-metric__unit">{unit}</span>}
			</div>
			<div className="svc-metric__label">{label}</div>
		</div>
	);
}

export function LoadingPlaceholder() {
	return (
		<div className="svc-placeholder">
			<Icon name="loader" size={16} className="svc-spin" />
		</div>
	);
}

export function UnavailableMessage() {
	return (
		<div className="svc-unavailable">
			<Icon name="warn" size={14} />
			Service unreachable
		</div>
	);
}

export function ServiceCard({
	title,
	description,
	href,
	icon,
	accentColor,
	status,
	children,
	span,
}: {
	title: string;
	description: string;
	href: string;
	icon: IconName;
	accentColor: string;
	status: ServiceStatus;
	children: ReactNode;
	span?: 2 | 3;
}) {
	const statusIcon = STATUS_ICON[status];
	return (
		<div
			className={[
				'svc-card',
				status === 'ok' ? '' : 'svc-card--degraded',
				span ? `svc-card--span${span}` : '',
			]
				.filter(Boolean)
				.join(' ')}
			style={{ '--svc-accent': accentColor } as CSSProperties}>
			<div className="svc-card__accent" />

			<div className="svc-card__header">
				<div className="svc-card__glyph">
					<Icon name={icon} size={18} />
				</div>
				<div className="svc-card__heading">
					<div className="svc-card__titlerow">
						<span className="svc-card__title">{title}</span>
						<StatusDot status={status} />
					</div>
					<div className="svc-card__desc">{description}</div>
				</div>
			</div>

			<div className="svc-card__metrics">{children}</div>

			<div className="svc-card__footer">
				<span
					className="svc-card__status"
					style={
						{ '--svc-status': statusColor(status) } as CSSProperties
					}>
					<Icon
						name={statusIcon}
						size={10}
						className={
							status === 'loading' ? 'svc-spin' : undefined
						}
					/>
					{statusLabel(status)}
				</span>
				<a className="svc-card__link" href={href}>
					Details
					<Icon name="forward" size={12} />
				</a>
			</div>
		</div>
	);
}
