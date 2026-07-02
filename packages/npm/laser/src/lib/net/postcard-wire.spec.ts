import { describe, it, expect } from 'vitest';
import type { ClientMessage } from './protocol';
import {
	decodeCombat,
	decodeEquipped,
	decodeFloorChange,
	decodeInventory,
	decodeItemPlaced,
	decodeItemUsed,
	decodePetBattleReplay,
	decodePetBattleState,
	decodePickup,
	decodeBlackjack,
	decodeProjectile,
	decodeServerEvent,
	decodeShop,
	decodeSpell,
	decodeStats,
	decodeStatus,
	decodeTrade,
	encodeClientMessage,
} from './postcard-wire';

const hex = (b: Uint8Array) =>
	Array.from(b)
		.map((x) => x.toString(16).padStart(2, '0'))
		.join('');

const fromHex = (s: string) =>
	Uint8Array.from(s.match(/../g)!.map((h) => parseInt(h, 16)));

describe('postcard ClientMessage encoder', () => {
	// Same message + expected bytes as the Rust fixture in proto.rs
	// (client_message_fixture_is_stable). Cross-language parity lock.
	it('encodes a Frame to the Rust postcard fixture', () => {
		const msg: ClientMessage = {
			Frame: {
				client_tick: 7,
				inputs: [
					{ Move: { seq: 3, mx: 127, my: -1, run: true, tick: 9 } },
					{ Fell: { tile: { x: 5, y: -3 } } },
					'Leave',
				],
			},
		};
		expect(hex(encodeClientMessage(msg))).toBe(
			'0e01070301037fff0109180a050d00',
		);
	});

	it('encodes JoinMatch (interior zero byte exercises COBS restuffing)', () => {
		const msg: ClientMessage = {
			JoinMatch: { protocol: 15, jwt: 'tok', kbve_username: 'h0ly' },
		};
		// postcard: 00(variant) 0f(proto) 03 746f6b("tok") 04 68306c79("h0ly").
		// The leading 0x00 splits the COBS run: 01 | 0b <11 bytes> | 00.
		expect(hex(encodeClientMessage(msg))).toBe(
			'010b0f03746f6b0468306c7900',
		);
	});
});

describe('postcard ServerEvent decoder', () => {
	// Same hex the Rust fixture (proto.rs server_event_fixtures) asserts.
	it('decodes the Rust Welcome fixture', () => {
		const ev = decodeServerEvent(
			fromHex('01160f03eeff830601010b77797665726e5f666972650100'),
		);
		expect('Welcome' in ev).toBe(true);
		if ('Welcome' in ev) {
			expect(ev.Welcome.protocol).toBe(15);
			expect(ev.Welcome.your_slot).toBe(3);
			expect(ev.Welcome.seed).toBe(0xc0ffee);
			expect(ev.Welcome.registry).toEqual([
				{ kind: 1, ref: 'wyvern_fire', cat: 1 },
			]);
		}
	});

	it('decodes the Rust Snapshot fixture field-for-field', () => {
		const ev = decodeServerEvent(
			fromHex(
				'040109640109010207ffff030a050881c002bf01180d033c5005010103050428c801010101020100',
			),
		);
		expect('Snapshot' in ev).toBe(true);
		if ('Snapshot' in ev) {
			const s = ev.Snapshot;
			expect(s.tick).toBe(9);
			expect(s.server_time_ms).toBe(100);
			expect(s.players).toEqual([]);
			expect(s.keyframe).toBe(true);
			expect(s.entities).toHaveLength(1);
			expect(s.entities[0]).toEqual({
				eid: 2,
				kind: 7,
				owner: 65535,
				tile: { x: 5, y: -3 },
				facing: 'Down',
				sub: 0x81,
				qx: 160,
				qy: -96,
				qvx: 12,
				qvy: -7,
				input_ack: 0,
				hp: 30,
				max_hp: 40,
				destroyed: false,
				z: -1,
				effects: [{ kind: 'Burn', remaining: 5 }],
				piloting: 0,
				mp: 20,
				max_mp: 100,
				energy: 0,
				max_energy: 0,
				stamina: 0,
				max_stamina: 0,
			});
		}
	});
});

describe('postcard Ephemeral payload decoder', () => {
	// Same hex the Rust fixture (proto.rs projectile_event_fixture_is_stable)
	// asserts — raw postcard, no COBS framing on the inner payload.
	it('decodes the Rust ProjectileEvent fixture', () => {
		const payload = Array.from(fromHex('020a050e04056172726f7701'));
		expect(decodeProjectile(payload)).toEqual({
			attacker: 2,
			from: { x: 5, y: -3 },
			to: { x: 7, y: 2 },
			kind: 'arrow',
			hit: true,
		});
	});

	// proto.rs floor_change_event_fixture_is_stable
	it('decodes the Rust FloorChangeEvent fixture', () => {
		expect(decodeFloorChange(Array.from(fromHex('040e05')))).toEqual({
			z: 2,
			tile: { x: 7, y: -3 },
		});
	});

	// Same hex the Rust fixture (proto.rs pet_battle_replay_fixture_is_stable) asserts.
	// Player+enemy teams, a PB_TURN then a PB_DAMAGE event, outcome PlayerWon. If either
	// language reorders a field this breaks — the cross-lock that catches proto skew.
	it('decodes the Rust PetBattleReplay fixture', () => {
		const payload =
			'01016d0352657805505001016d03466f6505505002' + // player[1] enemy[1] events seq 2
			'0b0002000002543101011838010368697409506c61796572576f6e';
		expect(decodePetBattleReplay(Array.from(fromHex(payload)))).toEqual({
			player: [
				{
					species_ref: 'm',
					nickname: 'Rex',
					level: 5,
					hp: 40,
					max_hp: 40,
				},
			],
			enemy: [
				{
					species_ref: 'm',
					nickname: 'Foe',
					level: 5,
					hp: 40,
					max_hp: 40,
				},
			],
			events: [
				{ kind: 11, side: 0, value: 1, hp: 0, flag: 0, text: 'T1' },
				{ kind: 1, side: 1, value: 12, hp: 28, flag: 1, text: 'hit' },
			],
			outcome: 'PlayerWon',
		});
	});

	// Same hex the Rust fixture (proto.rs pet_battle_state_fixture_is_stable) asserts —
	// the interactive battle snapshot: teams, active indices, a move with PP, the turn's
	// event, outcome, and awaiting/can_run flags. Cross-lock against proto skew.
	it('decodes the Rust PetBattleState fixture', () => {
		const payload =
			'01016d03526578053c5001016d03466f6505505000000100' +
			'05737061726b094c696768746e696e670150640f0f0101' +
			'01143c0003686974074f6e676f696e670101';
		expect(decodePetBattleState(Array.from(fromHex(payload)))).toEqual({
			player: [
				{
					species_ref: 'm',
					nickname: 'Rex',
					level: 5,
					hp: 30,
					max_hp: 40,
				},
			],
			enemy: [
				{
					species_ref: 'm',
					nickname: 'Foe',
					level: 5,
					hp: 40,
					max_hp: 40,
				},
			],
			p_active: 0,
			e_active: 0,
			moves: [
				{
					slot: 0,
					name: 'spark',
					element: 'Lightning',
					category: 1,
					power: 40,
					accuracy: 100,
					pp: 15,
					max_pp: 15,
				},
			],
			events: [
				{ kind: 1, side: 1, value: 10, hp: 30, flag: 0, text: 'hit' },
			],
			outcome: 'Ongoing',
			awaiting: true,
			can_run: true,
		});
	});

	it('decodes the Rust PickupEvent fixture', () => {
		expect(decodePickup(Array.from(fromHex('056172726f7703')))).toEqual({
			item_ref: 'arrow',
			count: 3,
		});
	});

	// proto.rs item_used_event_fixture_is_stable
	it('decodes the Rust ItemUsedEvent fixture', () => {
		expect(decodeItemUsed(Array.from(fromHex('06706f74696f6e18')))).toEqual(
			{ item_ref: 'potion', heal: 12 },
		);
	});

	// proto.rs combat_event_fixture_is_stable
	it('decodes the Rust CombatEvent fixture', () => {
		expect(
			decodeCombat(Array.from(fromHex('02070106676f626c696e0a0100'))),
		).toEqual({
			attacker: 2,
			target: 7,
			target_ref: 'goblin',
			dmg: 5,
			crit: true,
			died: false,
		});
	});

	// proto.rs equipped_event_fixture_is_stable
	it('decodes the Rust EquippedEvent fixture', () => {
		expect(
			decodeEquipped(
				Array.from(fromHex('010573776f726406776561706f6e0602')),
			),
		).toEqual({
			item_ref: 'sword',
			slot: 'weapon',
			attack: 3,
			defense: 1,
		});
	});

	// proto.rs stats_event_fixture_is_stable
	it('decodes the Rust StatsEvent fixture', () => {
		expect(decodeStats(Array.from(fromHex('0464c801500e031428')))).toEqual({
			level: 2,
			xp: 50,
			xp_next: 100,
			max_hp: 40,
			attack: 7,
			kills: 3,
			mp: 10,
			max_mp: 20,
		});
	});

	// proto.rs item_placed_event_fixture_is_stable
	it('decodes the Rust ItemPlacedEvent fixture', () => {
		expect(
			decodeItemPlaced(Array.from(fromHex('0863616d70666972650e050100'))),
		).toEqual({
			item_ref: 'campfire',
			tile: { x: 7, y: -3 },
			ok: true,
			reason: undefined,
		});
	});

	// proto.rs status_event_fixture_is_stable
	it('decodes the Rust StatusEvent fixture', () => {
		expect(decodeStatus(Array.from(fromHex('030305')))).toEqual({
			kind: 3,
			magnitude: -2,
			remaining: 5,
		});
	});

	// proto.rs inventory_sync_fixture_is_stable
	it('decodes the Rust InventorySync fixture', () => {
		expect(
			decodeInventory(
				Array.from(fromHex('0200056172726f77030006706f74696f6e01')),
			),
		).toEqual({
			items: [
				{ id: '', ref: 'arrow', count: 3 },
				{ id: '', ref: 'potion', count: 1 },
			],
		});
	});

	// proto.rs shop_result_fixture_is_stable
	it('decodes the Rust ShopResult fixture', () => {
		expect(
			decodeShop(Array.from(fromHex('03627579056172726f770201005a'))),
		).toEqual({
			action: 'buy',
			item_ref: 'arrow',
			qty: 2,
			ok: true,
			reason: '',
			balance: 90,
		});
	});

	// proto.rs blackjack_state_view_fixture_is_stable
	it('decodes the Rust BlackjackStateView fixture', () => {
		expect(
			decodeBlackjack(
				Array.from(
					fromHex(
						'037669700a506c617965725475726e010102616c0a0001020a070a11000000000000010901010101005a882702616200',
					),
				),
			),
		).toEqual({
			table_ref: 'vip',
			phase: 'PlayerTurn',
			seats: [
				{
					slot: 1,
					username: 'al',
					bet: 10,
					insurance: 0,
					hands: [
						{
							cards: [10, 7],
							bet: 10,
							value: 17,
							soft: false,
							doubled: false,
							surrendered: false,
							done: false,
							outcome: null,
						},
					],
					disconnected: false,
				},
			],
			dealer_hand: [9],
			dealer_hidden: true,
			active_slot: 1,
			active_hand: 0,
			your_balance: 90,
			deadline_ms: 5000,
			commitment: 'ab',
			seed: null,
		});
	});

	// proto.rs trade_state_view_fixture_is_stable
	it('decodes the Rust TradeStateView fixture', () => {
		expect(
			decodeTrade(
				Array.from(fromHex('046f70656e020100056172726f7703000001')),
			),
		).toEqual({
			status: 'open',
			with: 2,
			you: {
				items: [{ id: '', ref: 'arrow', count: 3 }],
				accepted: false,
			},
			them: { items: [], accepted: true },
		});
	});

	// proto.rs spell_result_fixture_is_stable
	it('decodes the Rust SpellResult fixture', () => {
		expect(
			decodeSpell(
				Array.from(fromHex('020107046865616c046865616c140100')),
			),
		).toEqual({
			caster: 2,
			target: 7,
			spell_ref: 'heal',
			effect: 'heal',
			amount: 10,
			ok: true,
			reason: '',
		});
	});
});
