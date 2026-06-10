import { useMemo, useState } from 'react';

type Team = 'blue' | 'red';
type Terrain = 'plain' | 'forest' | 'city' | 'ridge' | 'water' | 'hq';
type UnitType = 'infantry' | 'armor' | 'rocket';
type Phase = 'player' | 'enemy' | 'victory' | 'defeat';

interface Tile {
	terrain: Terrain;
	owner?: Team;
}

interface Unit {
	id: string;
	team: Team;
	type: UnitType;
	x: number;
	y: number;
	hp: number;
	acted: boolean;
}

interface UnitSpec {
	label: string;
	short: string;
	move: number;
	range: number;
	damage: number;
	maxHp: number;
}

const WIDTH = 8;
const HEIGHT = 8;

const UNITS: Record<UnitType, UnitSpec> = {
	infantry: {
		label: 'Ranger',
		short: 'R',
		move: 3,
		range: 1,
		damage: 34,
		maxHp: 100,
	},
	armor: {
		label: 'Bulldog',
		short: 'B',
		move: 4,
		range: 1,
		damage: 48,
		maxHp: 120,
	},
	rocket: {
		label: 'Lancer',
		short: 'L',
		move: 2,
		range: 3,
		damage: 42,
		maxHp: 90,
	},
};

const TERRAIN_COST: Record<Terrain, number> = {
	plain: 1,
	forest: 2,
	city: 1,
	ridge: 2,
	water: 99,
	hq: 1,
};

const TERRAIN_DEFENSE: Record<Terrain, number> = {
	plain: 0,
	forest: 8,
	city: 12,
	ridge: 10,
	water: 0,
	hq: 16,
};

const TERRAIN_LABEL: Record<Terrain, string> = {
	plain: 'Plain',
	forest: 'Forest',
	city: 'Depot',
	ridge: 'Ridge',
	water: 'Water',
	hq: 'HQ',
};

const MAP_ROWS: Terrain[][] = [
	['hq', 'plain', 'forest', 'plain', 'plain', 'ridge', 'plain', 'hq'],
	['plain', 'plain', 'forest', 'water', 'plain', 'plain', 'city', 'plain'],
	['city', 'plain', 'ridge', 'water', 'forest', 'plain', 'plain', 'plain'],
	['plain', 'plain', 'plain', 'plain', 'plain', 'ridge', 'forest', 'plain'],
	['plain', 'forest', 'ridge', 'plain', 'plain', 'plain', 'plain', 'plain'],
	['plain', 'plain', 'plain', 'forest', 'water', 'ridge', 'plain', 'city'],
	['plain', 'city', 'plain', 'plain', 'water', 'forest', 'plain', 'plain'],
	['hq', 'plain', 'ridge', 'plain', 'plain', 'forest', 'plain', 'hq'],
];

const INITIAL_UNITS: Unit[] = [
	{
		id: 'b1',
		team: 'blue',
		type: 'infantry',
		x: 0,
		y: 7,
		hp: 100,
		acted: false,
	},
	{
		id: 'b2',
		team: 'blue',
		type: 'armor',
		x: 1,
		y: 6,
		hp: 120,
		acted: false,
	},
	{
		id: 'b3',
		team: 'blue',
		type: 'rocket',
		x: 2,
		y: 7,
		hp: 90,
		acted: false,
	},
	{
		id: 'r1',
		team: 'red',
		type: 'infantry',
		x: 7,
		y: 0,
		hp: 100,
		acted: false,
	},
	{ id: 'r2', team: 'red', type: 'armor', x: 6, y: 1, hp: 120, acted: false },
	{ id: 'r3', team: 'red', type: 'rocket', x: 5, y: 0, hp: 90, acted: false },
];

function makeMap(): Tile[] {
	return MAP_ROWS.flatMap((row, y) =>
		row.map((terrain) => ({
			terrain,
			owner:
				terrain === 'hq'
					? y < 2
						? 'red'
						: y > 5
							? 'blue'
							: undefined
					: undefined,
		})),
	);
}

function key(x: number, y: number) {
	return `${x},${y}`;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
	return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function inBounds(x: number, y: number) {
	return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

function tileAt(map: Tile[], x: number, y: number) {
	return map[y * WIDTH + x];
}

function movementTiles(unit: Unit, units: Unit[], map: Tile[]) {
	const occupied = new Set(
		units
			.filter((u) => u.id !== unit.id && u.hp > 0)
			.map((u) => key(u.x, u.y)),
	);
	const frontier: Array<{ x: number; y: number; cost: number }> = [
		{ x: unit.x, y: unit.y, cost: 0 },
	];
	const best = new Map<string, number>([[key(unit.x, unit.y), 0]]);

	while (frontier.length) {
		const current = frontier.shift()!;
		for (const [dx, dy] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
		]) {
			const x = current.x + dx;
			const y = current.y + dy;
			const tileKey = key(x, y);
			if (!inBounds(x, y) || occupied.has(tileKey)) continue;

			const terrain = tileAt(map, x, y).terrain;
			const nextCost = current.cost + TERRAIN_COST[terrain];
			if (nextCost > UNITS[unit.type].move) continue;
			if (best.has(tileKey) && best.get(tileKey)! <= nextCost) continue;

			best.set(tileKey, nextCost);
			frontier.push({ x, y, cost: nextCost });
		}
	}

	best.delete(key(unit.x, unit.y));
	return best;
}

function damageFor(attacker: Unit, defender: Unit, map: Tile[]) {
	const attackerSpec = UNITS[attacker.type];
	const defense =
		TERRAIN_DEFENSE[tileAt(map, defender.x, defender.y).terrain];
	const healthScale = Math.max(0.35, attacker.hp / attackerSpec.maxHp);
	const armorPenalty =
		defender.type === 'armor' && attacker.type === 'infantry' ? 12 : 0;
	const rocketBonus =
		attacker.type === 'rocket' && defender.type === 'armor' ? 18 : 0;
	return Math.max(
		12,
		Math.round(
			(attackerSpec.damage + rocketBonus - armorPenalty - defense) *
				healthScale,
		),
	);
}

function unitAt(units: Unit[], x: number, y: number) {
	return units.find((unit) => unit.hp > 0 && unit.x === x && unit.y === y);
}

function applyAttack(
	units: Unit[],
	attacker: Unit,
	defender: Unit,
	map: Tile[],
) {
	const damage = damageFor(attacker, defender, map);
	return units
		.map((unit) =>
			unit.id === defender.id
				? { ...unit, hp: Math.max(0, unit.hp - damage) }
				: unit.id === attacker.id
					? { ...unit, acted: true }
					: unit,
		)
		.filter((unit) => unit.hp > 0);
}

function resetTeam(units: Unit[], team: Team) {
	return units.map((unit) =>
		unit.team === team ? { ...unit, acted: false } : unit,
	);
}

function resolvePhase(units: Unit[], current: Phase): Phase {
	const blueAlive = units.some((unit) => unit.team === 'blue' && unit.hp > 0);
	const redAlive = units.some((unit) => unit.team === 'red' && unit.hp > 0);
	if (!redAlive) return 'victory';
	if (!blueAlive) return 'defeat';
	return current;
}

function enemyTurn(units: Unit[], map: Tile[]) {
	let nextUnits = resetTeam(units, 'red');
	let log = 'Enemy convoy advances.';

	for (const enemy of nextUnits.filter(
		(unit) => unit.team === 'red' && unit.hp > 0,
	)) {
		const liveEnemy = nextUnits.find((unit) => unit.id === enemy.id);
		if (!liveEnemy) continue;

		const targets = nextUnits.filter(
			(unit) => unit.team === 'blue' && unit.hp > 0,
		);
		if (!targets.length) break;

		const inRange = targets
			.filter(
				(target) =>
					distance(liveEnemy, target) <= UNITS[liveEnemy.type].range,
			)
			.sort((a, b) => a.hp - b.hp)[0];

		if (inRange) {
			nextUnits = applyAttack(nextUnits, liveEnemy, inRange, map);
			log = `${UNITS[liveEnemy.type].label} hits ${UNITS[inRange.type].label}.`;
			continue;
		}

		const target = targets.sort(
			(a, b) => distance(liveEnemy, a) - distance(liveEnemy, b),
		)[0];
		const moves = [...movementTiles(liveEnemy, nextUnits, map).keys()]
			.map((tileKey) => {
				const [x, y] = tileKey.split(',').map(Number);
				return { x, y, score: distance({ x, y }, target) };
			})
			.sort((a, b) => a.score - b.score);

		const move = moves[0];
		if (move) {
			nextUnits = nextUnits.map((unit) =>
				unit.id === liveEnemy.id
					? { ...unit, x: move.x, y: move.y, acted: true }
					: unit,
			);
		}
	}

	return { units: resetTeam(nextUnits, 'blue'), log };
}

export default function ReactTacticsApp() {
	const [map] = useState<Tile[]>(() => makeMap());
	const [units, setUnits] = useState<Unit[]>(() =>
		INITIAL_UNITS.map((unit) => ({ ...unit })),
	);
	const [selectedId, setSelectedId] = useState<string | null>('b1');
	const [phase, setPhase] = useState<Phase>('player');
	const [turn, setTurn] = useState(1);
	const [message, setMessage] = useState(
		'Select a blue unit, move into range, and clear the red HQ guard.',
	);

	const selected = units.find(
		(unit) => unit.id === selectedId && unit.hp > 0,
	);
	const reachable = useMemo(
		() =>
			selected && phase === 'player' && !selected.acted
				? movementTiles(selected, units, map)
				: new Map<string, number>(),
		[selected, units, map, phase],
	);
	const attackable = useMemo(() => {
		if (!selected || phase !== 'player' || selected.acted)
			return new Set<string>();
		return new Set(
			units
				.filter((unit) => unit.team !== selected.team && unit.hp > 0)
				.filter(
					(unit) =>
						distance(selected, unit) <= UNITS[selected.type].range,
				)
				.map((unit) => key(unit.x, unit.y)),
		);
	}, [selected, units, phase]);

	const activeBlueUnits = units.filter(
		(unit) => unit.team === 'blue' && unit.hp > 0,
	);
	const activeRedUnits = units.filter(
		(unit) => unit.team === 'red' && unit.hp > 0,
	);
	const canEndTurn = phase === 'player';

	function commitUnits(nextUnits: Unit[], nextPhase: Phase = phase) {
		const resolved = resolvePhase(nextUnits, nextPhase);
		setUnits(nextUnits);
		setPhase(resolved);
		if (resolved === 'victory')
			setMessage('Victory. The red convoy is off the board.');
		if (resolved === 'defeat')
			setMessage('Defeat. Your command group was routed.');
	}

	function selectNextReady(nextUnits: Unit[]) {
		const nextReady = nextUnits.find(
			(unit) => unit.team === 'blue' && unit.hp > 0 && !unit.acted,
		);
		setSelectedId(nextReady?.id ?? null);
	}

	function handleTileClick(x: number, y: number) {
		if (phase !== 'player') return;
		const clickedUnit = unitAt(units, x, y);

		if (clickedUnit?.team === 'blue') {
			setSelectedId(clickedUnit.id);
			setMessage(
				clickedUnit.acted
					? `${UNITS[clickedUnit.type].label} already acted.`
					: `${UNITS[clickedUnit.type].label} ready.`,
			);
			return;
		}

		if (!selected || selected.acted) return;

		if (clickedUnit?.team === 'red' && attackable.has(key(x, y))) {
			const nextUnits = applyAttack(units, selected, clickedUnit, map);
			setMessage(
				`${UNITS[selected.type].label} attacks for ${damageFor(selected, clickedUnit, map)}.`,
			);
			commitUnits(nextUnits);
			selectNextReady(nextUnits);
			return;
		}

		if (reachable.has(key(x, y))) {
			const nextUnits = units.map((unit) =>
				unit.id === selected.id ? { ...unit, x, y } : unit,
			);
			setUnits(nextUnits);
			setMessage(
				`${UNITS[selected.type].label} moved. Attack if a target is in range.`,
			);
		}
	}

	function handleWait() {
		if (!selected || phase !== 'player') return;
		const nextUnits = units.map((unit) =>
			unit.id === selected.id ? { ...unit, acted: true } : unit,
		);
		setMessage(`${UNITS[selected.type].label} holds position.`);
		commitUnits(nextUnits);
		selectNextReady(nextUnits);
	}

	function endTurn() {
		if (!canEndTurn) return;
		setPhase('enemy');
		const result = enemyTurn(units, map);
		setTurn((value) => value + 1);
		setSelectedId(
			result.units.find((unit) => unit.team === 'blue' && unit.hp > 0)
				?.id ?? null,
		);
		setMessage(result.log);
		commitUnits(result.units, 'player');
	}

	function restart() {
		setUnits(INITIAL_UNITS.map((unit) => ({ ...unit })));
		setSelectedId('b1');
		setPhase('player');
		setTurn(1);
		setMessage(
			'Select a blue unit, move into range, and clear the red HQ guard.',
		);
	}

	return (
		<div className="tactics-shell" data-phase={phase}>
			<div className="tactics-topbar">
				<div>
					<p className="tactics-kicker">KBVE Arcade</p>
					<h2>Frontline Grid</h2>
				</div>
				<div className="tactics-status">
					<span>Turn {turn}</span>
					<span>
						{phase === 'player'
							? 'Blue command'
							: phase === 'enemy'
								? 'Red response'
								: phase}
					</span>
				</div>
			</div>

			<div className="tactics-layout">
				<div
					className="tactics-board"
					role="grid"
					aria-label="Frontline Grid battlefield">
					{map.map((tile, index) => {
						const x = index % WIDTH;
						const y = Math.floor(index / WIDTH);
						const unit = unitAt(units, x, y);
						const tileKey = key(x, y);
						const isSelected = unit?.id === selectedId;
						const isMove = reachable.has(tileKey);
						const isAttack = attackable.has(tileKey);

						return (
							<button
								key={tileKey}
								type="button"
								className={[
									'tactics-tile',
									`terrain-${tile.terrain}`,
									isSelected ? 'is-selected' : '',
									isMove ? 'is-move' : '',
									isAttack ? 'is-attack' : '',
								]
									.filter(Boolean)
									.join(' ')}
								onClick={() => handleTileClick(x, y)}
								role="gridcell"
								aria-label={`${TERRAIN_LABEL[tile.terrain]} ${x + 1}, ${y + 1}`}>
								<span className="terrain-mark">
									{tile.terrain === 'hq'
										? 'HQ'
										: tile.terrain === 'city'
											? 'D'
											: ''}
								</span>
								{unit && (
									<span
										className={`unit unit-${unit.team} unit-${unit.type}`}>
										<span>{UNITS[unit.type].short}</span>
										<meter
											min={0}
											max={UNITS[unit.type].maxHp}
											value={unit.hp}
										/>
									</span>
								)}
							</button>
						);
					})}
				</div>

				<aside className="tactics-panel">
					<div className="panel-section">
						<p className="panel-label">Orders</p>
						<p className="panel-message">{message}</p>
					</div>
					<div className="panel-section">
						<p className="panel-label">Selected</p>
						{selected ? (
							<div className="unit-card">
								<strong>{UNITS[selected.type].label}</strong>
								<span>
									{selected.team === 'blue' ? 'Blue' : 'Red'}{' '}
									unit
								</span>
								<span>
									HP {selected.hp}/
									{UNITS[selected.type].maxHp}
								</span>
								<span>
									Move {UNITS[selected.type].move} · Range{' '}
									{UNITS[selected.type].range}
								</span>
							</div>
						) : (
							<p className="panel-muted">
								No ready unit selected.
							</p>
						)}
					</div>
					<div className="panel-section score-row">
						<span>Blue {activeBlueUnits.length}</span>
						<span>Red {activeRedUnits.length}</span>
					</div>
					<div className="panel-actions">
						<button
							type="button"
							onClick={handleWait}
							disabled={
								!selected ||
								selected.acted ||
								phase !== 'player'
							}>
							Wait
						</button>
						<button
							type="button"
							onClick={endTurn}
							disabled={!canEndTurn}>
							End turn
						</button>
						<button type="button" onClick={restart}>
							Restart
						</button>
					</div>
				</aside>
			</div>
		</div>
	);
}
