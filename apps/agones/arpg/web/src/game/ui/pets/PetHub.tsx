import { useEffect, useState } from 'react';
import type { PetRosterSync, PetView } from '@kbve/laser';
import {
	FRIENDSHIP_DEVOTED,
	GENE_STATS,
	IV_MAX,
	IV_TOTAL_MAX,
	genderGlyph,
	natureEffect,
} from '@kbve/laser';
import {
	emitPetRosterOp,
	onPetRoster,
	type PetRosterOp,
} from '../../systems/hud';
import { arpgAsset } from '../../config';
import {
	GothicPanel,
	GothicTitleBar,
	GothicDivider,
	GothicCloseButton,
	useMountTransition,
} from '../gothic/Gothic';

const ACCENT = '#fcd34d';
const MUTED = '#9fb3d8';
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.9)';
const SPRITE_OF = (ref: string) => arpgAsset(`/assets/npc/${ref}.png`);

/** Turn a kebab-case ref into a readable label — the server sends item refs, not names. */
function prettyRef(ref: string): string {
	return ref
		.split('-')
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

/** Read a nature byte as `+Atk / -Spe`, or an em dash when it is one of the five neutrals.
 * The stat names come from the shared laser decode so the client never invents its own table. */
function natureLabel(nature: number): string {
	const { up, down } = natureEffect(nature);
	return up === null || down === null ? '\u2014' : `+${up} / \u2212${down}`;
}

/** Longest nickname the server will accept — mirrors `simgrid::PET_NICKNAME_MAX`. */
export const NICKNAME_MAX = 20;

/** Subscribe to the authoritative roster. The server pushes a full snapshot on join and
 * after every mutation, so there is no local mutation state to keep in sync — a rejected
 * op simply re-renders the roster the server still believes in. `null` means no sync has
 * landed yet, which reads differently from a synced-but-empty roster. */
export function usePetRoster(): PetRosterSync | null {
	const [roster, setRoster] = useState<PetRosterSync | null>(null);
	useEffect(() => onPetRoster(setRoster), []);
	return roster;
}

function hpColor(pct: number): string {
	return pct > 50 ? '#22c55e' : pct > 20 ? '#eab308' : '#ef4444';
}

function Bar({
	pct,
	color,
	height = 8,
}: {
	pct: number;
	color: string;
	height?: number;
}) {
	return (
		<div
			style={{
				height,
				background: 'rgba(0,0,0,0.6)',
				border: '1px solid #24314a',
				overflow: 'hidden',
			}}>
			<div
				style={{
					width: `${Math.max(0, Math.min(100, pct))}%`,
					height: '100%',
					background: color,
					transition: 'width 0.25s ease',
				}}
			/>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div
			style={{
				display: 'flex',
				justifyContent: 'space-between',
				gap: 8,
			}}>
			<span style={{ color: MUTED, textShadow: TEXT_SHADOW }}>
				{label}
			</span>
			<span style={{ color: '#e8eefc', textShadow: TEXT_SHADOW }}>
				{value}
			</span>
		</div>
	);
}

/** One stat's individual value as a bar. Six of these read faster than six numbers, and the
 * roll is fixed for the pet's life, so it wants to look like an attribute rather than a stat. */
function IvBar({ label, iv }: { label: string; iv: number }) {
	const pct = (Math.min(iv, IV_MAX) / IV_MAX) * 100;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
			<span
				style={{
					color: MUTED,
					fontSize: 10,
					width: 24,
					textShadow: TEXT_SHADOW,
				}}>
				{label}
			</span>
			<div
				style={{
					flex: 1,
					height: 4,
					background: 'rgba(255,255,255,0.10)',
					borderRadius: 2,
					overflow: 'hidden',
				}}>
				<div
					style={{
						width: `${pct}%`,
						height: '100%',
						background: iv === IV_MAX ? ACCENT : '#60a5fa',
					}}
				/>
			</div>
			<span
				style={{
					color: iv === IV_MAX ? ACCENT : MUTED,
					fontSize: 10,
					width: 16,
					textAlign: 'right',
					textShadow: TEXT_SHADOW,
				}}>
				{iv}
			</span>
		</div>
	);
}

function PetRow({
	pet,
	idx,
	lead,
	selected,
	onSelect,
}: {
	pet: PetView;
	idx: number;
	lead: boolean;
	selected: boolean;
	onSelect: () => void;
}) {
	const [broken, setBroken] = useState(false);
	const pct = (pet.hp / Math.max(1, pet.max_hp)) * 100;
	const fainted = pet.hp <= 0;
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			style={{
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				width: '100%',
				padding: 8,
				background: selected
					? 'rgba(110,168,255,0.16)'
					: 'rgba(8,10,16,0.7)',
				border: `2px solid ${selected ? '#6ea8ff' : '#24314a'}`,
				cursor: 'pointer',
				textAlign: 'left',
			}}>
			<div
				style={{
					width: 44,
					height: 44,
					flex: '0 0 auto',
					display: 'grid',
					placeItems: 'center',
					filter: fainted ? 'grayscale(1) brightness(0.5)' : 'none',
				}}>
				{broken ? (
					<span style={{ color: MUTED, fontSize: 10 }}>?</span>
				) : (
					<img
						src={SPRITE_OF(pet.species_ref)}
						alt={pet.nickname}
						onError={() => setBroken(true)}
						style={{
							maxWidth: '100%',
							maxHeight: '100%',
							imageRendering: 'pixelated',
						}}
					/>
				)}
			</div>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
					<span
						style={{
							color: '#e8eefc',
							fontWeight: 700,
							textShadow: TEXT_SHADOW,
							overflow: 'hidden',
							textOverflow: 'ellipsis',
							whiteSpace: 'nowrap',
						}}>
						{pet.nickname}
					</span>
					{lead && (
						<span
							style={{
								color: '#0b0e14',
								background: ACCENT,
								fontSize: 9,
								fontWeight: 800,
								padding: '1px 4px',
								letterSpacing: 0.5,
							}}>
							LEAD
						</span>
					)}
				</div>
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						fontSize: 11,
						color: MUTED,
						textShadow: TEXT_SHADOW,
					}}>
					<span>Lv {pet.level}</span>
					<span>
						{pet.hp}/{pet.max_hp}
					</span>
				</div>
				<Bar pct={pct} color={hpColor(pct)} height={6} />
			</div>
			<span style={{ color: MUTED, fontSize: 10 }}>#{idx + 1}</span>
		</button>
	);
}

function PetDetail({
	pet,
	idx,
	lead,
	onOp,
}: {
	pet: PetView;
	idx: number;
	lead: boolean;
	onOp: (op: PetRosterOp) => void;
}) {
	const [draft, setDraft] = useState(pet.nickname);
	const [confirmRelease, setConfirmRelease] = useState(false);
	// A sync can rename or reorder underneath an open detail view; re-seed the draft and
	// drop any armed release when the identity or the server's name changes.
	useEffect(() => {
		setDraft(pet.nickname);
		setConfirmRelease(false);
	}, [pet.id, pet.nickname]);
	const trimmed = draft.trim();
	const canRename = trimmed.length > 0 && trimmed !== pet.nickname;
	// Damage and PP spend persist between duels, so an elixir is only worth offering when
	// there is something to restore. The server refuses a wasted one anyway.
	const worn = pet.hp < pet.max_hp || pet.moves.some((m) => m.pp < m.max_pp);
	const pct = (pet.hp / Math.max(1, pet.max_hp)) * 100;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
			<div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
				<img
					src={SPRITE_OF(pet.species_ref)}
					alt={pet.nickname}
					style={{
						width: 'clamp(72px, 18vmin, 120px)',
						imageRendering: 'pixelated',
						filter:
							pet.hp <= 0
								? 'grayscale(1) brightness(0.5)'
								: 'none',
					}}
				/>
				<div
					style={{
						flex: 1,
						minWidth: 0,
						display: 'flex',
						flexDirection: 'column',
						gap: 6,
					}}>
					<div
						style={{
							color: ACCENT,
							fontWeight: 800,
							textShadow: TEXT_SHADOW,
						}}>
						{pet.nickname}
					</div>
					<div
						style={{
							color: MUTED,
							fontSize: 11,
							textShadow: TEXT_SHADOW,
						}}>
						{pet.species_ref} &middot; Lv {pet.level}
					</div>
					<div style={{ fontSize: 11, color: MUTED }}>
						HP {pet.hp}/{pet.max_hp}
					</div>
					<Bar pct={pct} color={hpColor(pct)} />
					<div
						style={{ fontSize: 11, color: MUTED }}
						data-testid="xp">
						{pet.xp_to_next > 0
							? `XP ${pet.xp}/${pet.xp_to_next}`
							: `XP ${pet.xp} (max level)`}
					</div>
					{pet.xp_to_next > 0 && (
						<Bar
							pct={(pet.xp / pet.xp_to_next) * 100}
							color={ACCENT}
							height={5}
						/>
					)}
				</div>
			</div>

			<GothicDivider />

			<div
				style={{
					display: 'grid',
					gridTemplateColumns: '1fr 1fr',
					gap: '2px 16px',
					fontSize: 12,
				}}>
				<Stat label="Attack" value={pet.attack} />
				<Stat label="Defense" value={pet.defense} />
				<Stat label="Sp. Atk" value={pet.sp_attack} />
				<Stat label="Sp. Def" value={pet.sp_defense} />
				<Stat label="Speed" value={pet.speed} />
			</div>

			<GothicDivider />

			<div
				style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
				data-testid="pet-genetics">
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						color: MUTED,
						fontSize: 11,
						textShadow: TEXT_SHADOW,
					}}>
					<span>
						Individual{' '}
						{pet.gender !== 0 && (
							<span data-testid="pet-gender">
								{genderGlyph(pet.gender)}
							</span>
						)}
					</span>
					<span data-testid="pet-nature">
						{natureLabel(pet.nature)}
					</span>
				</div>
				{pet.ivs.map((iv, i) => (
					<IvBar key={GENE_STATS[i]} label={GENE_STATS[i]} iv={iv} />
				))}
				<div
					style={{
						display: 'flex',
						justifyContent: 'space-between',
						fontSize: 11,
						color: MUTED,
						textShadow: TEXT_SHADOW,
					}}>
					<span data-testid="pet-friendship">
						{pet.friendship >= FRIENDSHIP_DEVOTED
							? `Devoted (${pet.friendship}) \u2014 +10% damage`
							: `Friendship ${pet.friendship}/${FRIENDSHIP_DEVOTED}`}
					</span>
					<span>
						{pet.ivs.reduce((a, b) => a + b, 0)}/{IV_TOTAL_MAX}
					</span>
				</div>
			</div>

			<GothicDivider />

			<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
				<div
					style={{
						color: MUTED,
						fontSize: 11,
						textShadow: TEXT_SHADOW,
					}}>
					Moves
				</div>
				{pet.moves.length === 0 ? (
					<div
						style={{
							color: MUTED,
							fontSize: 11,
							fontStyle: 'italic',
						}}>
						No moves learned.
					</div>
				) : (
					pet.moves.map((m) => (
						<div
							key={m.ability_id}
							style={{
								display: 'flex',
								justifyContent: 'space-between',
								fontSize: 12,
								color: '#e8eefc',
								textShadow: TEXT_SHADOW,
							}}>
							<span>{m.ability_id}</span>
							<span
								style={{
									color: m.pp === 0 ? '#ef4444' : MUTED,
								}}>
								{m.pp}/{m.max_pp} PP
							</span>
						</div>
					))
				)}
			</div>

			<GothicDivider />

			<div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
				<input
					value={draft}
					maxLength={NICKNAME_MAX}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && canRename) {
							onOp({ kind: 'rename', idx, name: trimmed });
						}
					}}
					aria-label="Nickname"
					style={{
						flex: 1,
						minWidth: 0,
						padding: '4px 6px',
						background: 'rgba(0,0,0,0.6)',
						border: '2px solid #24314a',
						color: '#e8eefc',
						fontSize: 12,
					}}
				/>
				<HubButton
					disabled={!canRename}
					onClick={() =>
						onOp({ kind: 'rename', idx, name: trimmed })
					}>
					Rename
				</HubButton>
			</div>

			{pet.evolve_items.length > 0 && (
				<>
					<GothicDivider />
					<div
						style={{
							display: 'flex',
							flexDirection: 'column',
							gap: 4,
						}}>
						<div
							style={{
								color: MUTED,
								fontSize: 11,
								textShadow: TEXT_SHADOW,
							}}>
							Evolution — permanent, and only once
						</div>
						<div
							style={{
								display: 'flex',
								gap: 6,
								flexWrap: 'wrap',
							}}
							data-testid="evolve-options">
							{pet.evolve_items.map((itemRef) => (
								<HubButton
									key={itemRef}
									onClick={() =>
										onOp({
											kind: 'evolve',
											idx,
											itemRef,
										})
									}>
									{prettyRef(itemRef)}
								</HubButton>
							))}
						</div>
					</div>
				</>
			)}

			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
				<HubButton
					disabled={lead}
					onClick={() => onOp({ kind: 'setActive', idx })}>
					{lead ? 'Lead' : 'Make lead'}
				</HubButton>
				<HubButton
					disabled={!worn}
					onClick={() => onOp({ kind: 'elixir', idx })}>
					Use elixir
				</HubButton>
				{confirmRelease ? (
					<>
						<HubButton
							danger
							onClick={() => {
								onOp({ kind: 'release', idx });
								setConfirmRelease(false);
							}}>
							Confirm release
						</HubButton>
						<HubButton onClick={() => setConfirmRelease(false)}>
							Cancel
						</HubButton>
					</>
				) : (
					<HubButton danger onClick={() => setConfirmRelease(true)}>
						Release
					</HubButton>
				)}
			</div>
		</div>
	);
}

function HubButton({
	children,
	danger = false,
	disabled = false,
	onClick,
}: {
	children: React.ReactNode;
	danger?: boolean;
	disabled?: boolean;
	onClick?: () => void;
}) {
	const [hover, setHover] = useState(false);
	const border = danger ? '#7f1d1d' : '#24314a';
	return (
		<button
			type="button"
			disabled={disabled}
			onClick={onClick}
			onPointerEnter={() => setHover(true)}
			onPointerLeave={() => setHover(false)}
			style={{
				padding: '5px 10px',
				fontSize: 12,
				fontWeight: 700,
				color: disabled ? MUTED : '#e8eefc',
				background: disabled
					? 'rgba(8,10,16,0.6)'
					: hover
						? danger
							? 'rgba(127,29,29,0.5)'
							: 'rgba(110,168,255,0.22)'
						: 'rgba(8,10,16,0.85)',
				border: `2px solid ${border}`,
				cursor: disabled ? 'default' : 'pointer',
				textShadow: TEXT_SHADOW,
			}}>
			{children}
		</button>
	);
}

/** The pet hub, driven purely by props: the player's party, their stats and moves, and
 * the lead/rename/release controls. `roster` of `null` means no sync has landed yet.
 *
 * Every mutation is a request, never a local edit — the view renders only what the
 * server has confirmed, so a rejected op (mid-duel, bad index) visibly snaps back.
 * [`PetHubPanel`] is the bus-connected wrapper; this is the testable half. */
export function PetHubView({
	roster,
	onOp,
	onClose,
	open = true,
}: {
	roster: PetRosterSync | null;
	onOp: (op: PetRosterOp) => void;
	onClose: () => void;
	open?: boolean;
}) {
	const [sel, setSel] = useState(0);
	const { mounted, shown } = useMountTransition(open, 180);

	const pets = roster?.pets ?? [];
	// Clamp the selection when a release shortens the roster underneath it.
	const selIdx = pets.length === 0 ? 0 : Math.min(sel, pets.length - 1);
	useEffect(() => {
		if (selIdx !== sel) setSel(selIdx);
	}, [selIdx, sel]);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!mounted) return null;

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				display: 'grid',
				placeItems: 'center',
				pointerEvents: 'auto',
				background: 'rgba(2,4,8,0.55)',
				opacity: shown ? 1 : 0,
				transition: 'opacity 0.18s ease',
			}}>
			<div
				style={{
					width: 'min(94vw, 720px)',
					maxHeight: '90vh',
					overflow: 'auto',
				}}>
				<GothicPanel padding={0}>
					<GothicTitleBar>
						<span
							style={{
								color: ACCENT,
								fontWeight: 800,
								letterSpacing: 1,
								textShadow: TEXT_SHADOW,
							}}>
							PETS
						</span>
						<GothicCloseButton
							onClick={onClose}
							style={{ position: 'absolute', right: 8 }}
						/>
					</GothicTitleBar>
					<div style={{ padding: 16 }}>
						{roster === null ? (
							<div
								style={{
									color: MUTED,
									textAlign: 'center',
									padding: 24,
								}}>
								Loading roster&hellip;
							</div>
						) : pets.length === 0 ? (
							<div
								style={{
									color: MUTED,
									textAlign: 'center',
									padding: 24,
									lineHeight: 1.6,
								}}>
								<div
									style={{
										color: '#e8eefc',
										fontWeight: 700,
									}}>
									No pets yet.
								</div>
								<div style={{ fontSize: 12 }}>
									Catch one in the wild and it will appear
									here.
								</div>
							</div>
						) : (
							<div
								style={{
									display: 'grid',
									gridTemplateColumns:
										'minmax(200px, 1fr) minmax(240px, 1.4fr)',
									gap: 16,
								}}>
								<div
									style={{
										display: 'flex',
										flexDirection: 'column',
										gap: 6,
									}}>
									{pets.map((pet, i) => (
										<PetRow
											key={pet.id}
											pet={pet}
											idx={i}
											lead={roster.active === i}
											selected={i === selIdx}
											onSelect={() => setSel(i)}
										/>
									))}
								</div>
								<PetDetail
									pet={pets[selIdx]}
									idx={selIdx}
									lead={roster.active === selIdx}
									onOp={onOp}
								/>
							</div>
						)}
					</div>
				</GothicPanel>
			</div>
		</div>
	);
}

/** The pet hub as the HUD mounts it: subscribes to the roster and forwards every
 * mutation onto the bus for the scene to send. All rendering lives in
 * [`PetHubView`]. */
export function PetHubPanel({
	open,
	onClose,
}: {
	open: boolean;
	onClose: () => void;
}) {
	const roster = usePetRoster();
	return (
		<PetHubView
			open={open}
			roster={roster}
			onOp={emitPetRosterOp}
			onClose={onClose}
		/>
	);
}
