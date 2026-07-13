import { useMemo, useState } from 'react';
import { CLIPS, CLIP_CATEGORIES, type ClipInfo } from './clips';
import { bindingOf } from './controls';
import { CodexViewer } from './CodexViewer';
import { setScreen } from './store';

const wrap: React.CSSProperties = {
	position: 'fixed',
	inset: 0,
	background: '#07070bee',
	color: '#e8e8ee',
	font: '13px/1.4 ui-monospace, monospace',
	display: 'flex',
	flexDirection: 'column',
	zIndex: 40,
};

export function Codex() {
	const [sel, setSel] = useState<ClipInfo>(CLIPS[0]);
	const [q, setQ] = useState('');

	const groups = useMemo(() => {
		const needle = q.trim().toLowerCase();
		const list = needle
			? CLIPS.filter((c) => c.name.toLowerCase().includes(needle))
			: CLIPS;
		return CLIP_CATEGORIES.map((cat) => ({
			cat,
			items: list.filter((c) => c.category === cat),
		})).filter((g) => g.items.length);
	}, [q]);

	const binding = bindingOf(sel.name);

	return (
		<div style={wrap}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					padding: '12px 16px',
					borderBottom: '1px solid #ffffff18',
				}}>
				<strong style={{ letterSpacing: 2, fontSize: 15 }}>
					CODEX
				</strong>
				<span style={{ opacity: 0.5 }}>{CLIPS.length} animations</span>
				<input
					value={q}
					onChange={(e) => setQ(e.target.value)}
					placeholder="search…"
					style={{
						marginLeft: 'auto',
						background: '#ffffff10',
						border: '1px solid #ffffff20',
						color: '#fff',
						padding: '5px 9px',
						borderRadius: 4,
						outline: 'none',
					}}
				/>
				<button onClick={() => setScreen('main')} style={btn}>
					← Menu
				</button>
			</div>

			<div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
				<div
					style={{ width: 300, overflowY: 'auto', padding: '8px 0' }}>
					{groups.map((g) => (
						<div key={g.cat}>
							<div
								style={{
									padding: '6px 16px',
									opacity: 0.5,
									textTransform: 'uppercase',
									fontSize: 11,
									letterSpacing: 1,
								}}>
								{g.cat}
							</div>
							{g.items.map((c) => {
								const active = c.name === sel.name;
								return (
									<div
										key={c.name}
										onClick={() => setSel(c)}
										style={{
											padding: '5px 16px',
											cursor: 'pointer',
											display: 'flex',
											justifyContent: 'space-between',
											background: active
												? '#4a6a8a55'
												: 'transparent',
											borderLeft: active
												? '3px solid #7ab6ff'
												: '3px solid transparent',
										}}>
										<span>{c.name}</span>
										<span style={{ opacity: 0.4 }}>
											{c.duration.toFixed(1)}s
										</span>
									</div>
								);
							})}
						</div>
					))}
				</div>

				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
						borderLeft: '1px solid #ffffff18',
					}}>
					<div style={{ flex: 1, minHeight: 0 }}>
						<CodexViewer clip={sel.name} />
					</div>
					<div
						style={{
							padding: '14px 18px',
							borderTop: '1px solid #ffffff18',
						}}>
						<div style={{ fontSize: 16, marginBottom: 6 }}>
							{sel.name}
						</div>
						<div style={{ opacity: 0.5, marginBottom: 10 }}>
							{sel.category} · {sel.duration.toFixed(2)}s
						</div>
						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
							}}>
							{binding && binding.keys.length ? (
								binding.keys.map((k) => (
									<kbd key={k} style={key}>
										{k}
									</kbd>
								))
							) : (
								<span style={{ opacity: 0.35 }}>
									— not bound to a control —
								</span>
							)}
							{binding?.note && (
								<span style={{ opacity: 0.55, marginLeft: 4 }}>
									{binding.note}
								</span>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

const btn: React.CSSProperties = {
	background: '#ffffff12',
	border: '1px solid #ffffff22',
	color: '#fff',
	padding: '5px 12px',
	borderRadius: 4,
	cursor: 'pointer',
};

const key: React.CSSProperties = {
	background: '#ffffff14',
	border: '1px solid #ffffff30',
	borderBottom: '2px solid #ffffff30',
	borderRadius: 4,
	padding: '3px 9px',
	fontSize: 13,
	minWidth: 14,
	textAlign: 'center',
};
