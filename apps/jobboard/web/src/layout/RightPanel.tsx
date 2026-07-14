import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
	Stack,
	Text,
	Badge,
	Avatar,
	PressableSurface,
	tokens,
} from '@kbve/rn/ui';
import { Skeleton } from '../components/ui';
import { Phone, Video, MessageSquare } from 'lucide-react';
import { Panel } from '../ui/Panel';
import { fetchTaxonomy, type TaxonomyItem, type Vertical } from '../api/client';

export type Selection = { kind: 'vertical'; vertical: Vertical } | null;

function Clock() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 1000);
		return () => clearInterval(t);
	}, []);
	const day = now.toLocaleDateString(undefined, {
		weekday: 'long',
		day: 'numeric',
	});
	const time = now.toLocaleTimeString(undefined, {
		hour: '2-digit',
		minute: '2-digit',
	});
	return (
		<Panel gradient="accent" glow>
			<Text variant="caption" style={{ color: 'rgba(255,255,255,0.8)' }}>
				{day}
			</Text>
			<Text variant="display" weight="bold" style={{ color: '#fff' }}>
				{time}
			</Text>
		</Panel>
	);
}

const CONTACTS = [
	{ name: 'Garold Feeber', role: 'Recruiter · Acme', note: 'Follow up' },
	{ name: 'Mario Senjinelli', role: 'Hiring lead · Volt', note: 'Interview' },
	{ name: 'Jason Musk', role: 'Founder · Nova', note: 'Presentation' },
	{ name: 'Mabel Pines', role: 'PM · Mystery', note: 'Offer sent' },
	{ name: 'Todd Hovard', role: 'Designer · Loop', note: 'New match' },
];

function ActionButton({ children }: { children: React.ReactNode }) {
	return (
		<PressableSurface
			style={{
				width: 38,
				height: 38,
				alignItems: 'center',
				justifyContent: 'center',
				borderRadius: tokens.radius.md,
				backgroundColor: 'rgba(255,255,255,0.18)',
			}}>
			{children}
		</PressableSurface>
	);
}

function FeaturedContact() {
	const c = CONTACTS[2];
	return (
		<Panel gradient="hero" glow style={{ gap: tokens.space.md }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					gap: tokens.space.sm,
				}}>
				<Avatar name={c.name} size={44} />
				<Stack gap="xs" style={{ flex: 1 }}>
					<Text
						variant="label"
						weight="bold"
						style={{ color: '#fff' }}>
						{c.name}
					</Text>
					<Text
						variant="caption"
						style={{ color: 'rgba(255,255,255,0.75)' }}>
						{c.role}
					</Text>
				</Stack>
			</View>
			<Stack direction="row" gap="sm">
				<ActionButton>
					<Phone size={18} color="#fff" />
				</ActionButton>
				<ActionButton>
					<Video size={18} color="#fff" />
				</ActionButton>
				<ActionButton>
					<MessageSquare size={18} color="#fff" />
				</ActionButton>
			</Stack>
		</Panel>
	);
}

function ContactList() {
	return (
		<Stack gap="md">
			<Text variant="label" tone="muted">
				Pipeline
			</Text>
			<Stack gap="md">
				{CONTACTS.map((c) => (
					<View
						key={c.name}
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							gap: tokens.space.sm,
						}}>
						<Avatar name={c.name} size={36} />
						<Stack gap="xs" style={{ flex: 1 }}>
							<Text variant="label">{c.name}</Text>
							<Text variant="caption" tone="faint">
								{c.role}
							</Text>
						</Stack>
						<Text variant="caption" tone="muted">
							{c.note}
						</Text>
					</View>
				))}
			</Stack>
		</Stack>
	);
}

function VerticalDetail({ vertical }: { vertical: Vertical }) {
	const [items, setItems] = useState<TaxonomyItem[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		setItems(null);
		setError(null);
		fetchTaxonomy(vertical.id)
			.then((r) => alive && setItems(r.taxonomy))
			.catch((e) => alive && setError(String(e)));
		return () => {
			alive = false;
		};
	}, [vertical.id]);

	return (
		<Stack gap="md">
			<Stack gap="xs">
				<Text variant="title">{vertical.label}</Text>
				<Text tone="muted" variant="caption">
					{vertical.description || 'No description yet.'}
				</Text>
			</Stack>
			<Text variant="label" tone="muted">
				Taxonomy
			</Text>
			{error ? (
				<Text tone="danger" variant="caption">
					{error}
				</Text>
			) : !items ? (
				<Stack gap="xs">
					<Skeleton width="80%" />
					<Skeleton width="60%" />
					<Skeleton width="70%" />
				</Stack>
			) : items.length === 0 ? (
				<Text tone="faint" variant="caption">
					No taxonomy yet.
				</Text>
			) : (
				<View
					style={{
						flexDirection: 'row',
						flexWrap: 'wrap',
						gap: tokens.space.xs,
					}}>
					{items.map((t) => (
						<Badge key={t.id} label={t.label} />
					))}
				</View>
			)}
		</Stack>
	);
}

export function RightPanel({ selection }: { selection: Selection }) {
	if (selection) {
		return (
			<Stack gap="lg" style={{ flex: 1 }}>
				<Clock />
				<Panel style={{ flex: 1 }}>
					<VerticalDetail vertical={selection.vertical} />
				</Panel>
			</Stack>
		);
	}
	return (
		<Stack gap="lg" style={{ flex: 1 }}>
			<Clock />
			<FeaturedContact />
			<Panel style={{ flex: 1 }}>
				<ContactList />
			</Panel>
		</Stack>
	);
}
