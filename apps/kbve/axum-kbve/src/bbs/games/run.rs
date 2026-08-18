use bevy_dungeon::content::{self, TileVisibility};
use bevy_dungeon::types::{
    self, ClassType, Direction, GameAction, GamePhase, MapPos, RoomType, SessionState,
};
use bevy_dungeon::{PlayerId, logic, skills, start_solo};

use super::dungeon::{Actor, Frame, draw_frame};
use super::map::{self, Cell, Grid, Links};
use super::text::Rng;
use super::text::strip_markup;
use super::{Flow, Game};
use crate::bbs::door::DoorContext;
use crate::bbs::render::{Ink, Screen, wrap_lines};

const LOG_KEPT: usize = 12;
const MAP_SPAN: i16 = 4;
const INDENT: &str = "    ";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum View {
    Play,
    Map,
    Items,
    Shop,
    Craft,
}

/// What a key on the board does: hand something to the rules engine, or start
/// a fresh run once this one is over.
#[derive(Debug, Clone)]
enum Act {
    Do(GameAction),
    Restart,
}

/// One line of the pack.
struct Carried {
    key: Option<char>,
    label: String,
    detail: Option<String>,
    action: Option<GameAction>,
}

/// One line of the merchant's stall, on either side of the counter.
struct Offer {
    key: Option<char>,
    label: String,
    id: String,
}

/// Hands out single-key labels and stops rather than wrapping past the end of
/// its run, so a long list is partly keyed instead of double-keyed.
struct KeyRun {
    next: Option<char>,
    last: char,
    reserved: &'static [char],
}

impl KeyRun {
    fn digits() -> Self {
        Self {
            next: Some('1'),
            last: '9',
            reserved: &[],
        }
    }

    /// Sell keys. `B` opens and closes the stall and `Q` leaves it, so neither
    /// can also name a row.
    fn letters() -> Self {
        Self {
            next: Some('A'),
            last: 'K',
            reserved: &['B', 'Q'],
        }
    }

    fn next(&mut self) -> Option<char> {
        loop {
            let this = self.next?;
            self.next = if this == self.last {
                None
            } else {
                char::from_u32(this as u32 + 1)
            };
            if !self.reserved.contains(&this) {
                return Some(this);
            }
        }
    }
}

/// One list row: keyed if the caller can act on it, dimmed and indented if it
/// is only there to be read.
fn draw_row(screen: &mut Screen, key: Option<char>, label: &str, detail: Option<&str>) {
    let width = screen.width.saturating_sub(1);
    match key {
        Some(key) => screen.item(key, label),
        None => screen
            .ink(Ink::Dim)
            .line(&format!("{INDENT}{label}"))
            .reset(),
    };
    if let Some(detail) = detail {
        screen.ink(Ink::Dim);
        for line in wrap_lines(&strip_markup(detail), width - INDENT.len()) {
            screen.line(&format!("{INDENT}{line}"));
        }
        screen.reset();
    }
}

/// Whether an item needs something to point at. Offering a bomb with no enemy
/// in the room earns "No enemy to target." from the engine.
fn needs_enemy(effect: &bevy_dungeon::types::UseEffect) -> bool {
    use bevy_dungeon::types::UseEffect;
    matches!(
        effect,
        UseEffect::DamageEnemy { .. } | UseEffect::DamageAndApply { .. }
    )
}

/// A one-line reminder of what a piece of gear is worth wearing for.
fn gear_summary(gear: &bevy_dungeon::types::GearDef) -> String {
    let mut parts = Vec::new();
    if gear.bonus_damage != 0 {
        parts.push(format!("{:+} damage", gear.bonus_damage));
    }
    if gear.bonus_armor != 0 {
        parts.push(format!("{:+} armor", gear.bonus_armor));
    }
    if gear.bonus_hp != 0 {
        parts.push(format!("{:+} HP", gear.bonus_hp));
    }
    if parts.is_empty() {
        "Wearable.".to_owned()
    } else {
        format!("Wear for {}.", parts.join(", "))
    }
}

/// A dungeon run on the board, driven by the same `bevy_dungeon` rules the
/// Discord bot uses. Nothing is persisted yet: the run ends with the call.
pub struct Run {
    state: SessionState,
    actor: PlayerId,
    view: View,
    notice: Option<String>,
    guest: bool,
}

impl Run {
    pub fn new(mut rng: Rng, ctx: &DoorContext) -> Self {
        let actor = PlayerId::new(rng.next_u64() | 1);
        let class = match rng.below(3) {
            0 => ClassType::Warrior,
            1 => ClassType::Rogue,
            _ => ClassType::Cleric,
        };
        Self {
            state: start_solo(actor, &ctx.handle, class),
            actor,
            view: View::Play,
            notice: None,
            guest: !ctx.authed(),
        }
    }

    #[cfg(test)]
    pub fn phase(&self) -> GamePhase {
        self.state.phase.clone()
    }

    #[cfg(test)]
    pub fn hp(&self) -> i32 {
        self.state.player(self.actor).hp
    }

    #[cfg(test)]
    pub fn keys(&self) -> Vec<char> {
        self.actions().into_iter().map(|(k, _, _)| k).collect()
    }

    #[cfg(test)]
    pub fn pack_keys(&self) -> Vec<char> {
        self.items().into_iter().filter_map(|c| c.key).collect()
    }

    #[cfg(test)]
    pub fn pack(&self) -> Vec<String> {
        self.items().into_iter().map(|c| c.label).collect()
    }

    #[cfg(test)]
    pub fn stall_labels(&self) -> (Vec<(Option<char>, String)>, Vec<(Option<char>, String)>) {
        let (buy, sell) = self.stall();
        (
            buy.into_iter().map(|o| (o.key, o.label)).collect(),
            sell.into_iter().map(|o| (o.key, o.label)).collect(),
        )
    }

    #[cfg(test)]
    pub fn gold(&self) -> i32 {
        self.state.player(self.actor).gold
    }

    #[cfg(test)]
    pub fn give(&mut self, item_ref: &str, qty: u32) {
        let actor = self.actor;
        types::inv_add_qty(&mut self.state.player_mut(actor).inventory, item_ref, qty);
    }

    #[cfg(test)]
    pub fn recipe_keys(&self) -> Vec<char> {
        self.recipes().into_iter().filter_map(|r| r.key).collect()
    }

    #[cfg(test)]
    pub fn log(&self) -> Vec<String> {
        self.state.log.clone()
    }

    #[cfg(test)]
    pub fn notice(&self) -> Option<&str> {
        self.notice.as_deref()
    }

    /// Hand an action to the rules engine.
    ///
    /// `apply_action` already folds its own log lines into `session.log`, so
    /// the board must not append them a second time — doing so printed every
    /// line twice.
    fn act(&mut self, action: GameAction) {
        match logic::apply_action(&mut self.state, action, self.actor) {
            Ok(_) => self.notice = None,
            Err(reason) => self.notice = Some(reason),
        }
        let len = self.state.log.len();
        if len > LOG_KEPT {
            self.state.log.drain(..len - LOG_KEPT);
        }
    }

    /// Exits belong to the map tile, not the room description.
    fn exits(&self) -> Vec<Direction> {
        self.state
            .map
            .tiles
            .get(&self.state.map.position)
            .map(|t| t.exits.clone())
            .unwrap_or_default()
    }

    /// The carried stacks, keyed by what the board can do with each: drink it,
    /// wear it, or neither. Quest pieces and anything with no use effect are
    /// listed without a key rather than offered and then refused.
    fn items(&self) -> Vec<Carried> {
        let mut key = KeyRun::digits();
        types::inv_to_legacy(&self.state.player(self.actor).inventory)
            .into_iter()
            .filter(|stack| stack.qty > 0)
            .map(|stack| {
                let item = content::find_item(&stack.item_id);
                let gear = content::find_gear(&stack.item_id);
                let name = item
                    .map(|d| d.name)
                    .or(gear.map(|g| g.name))
                    .or_else(|| content::material_name(&stack.item_id))
                    .unwrap_or(stack.item_id.as_str());
                let label = if stack.qty > 1 {
                    format!("{name} x{}", stack.qty)
                } else {
                    name.to_owned()
                };

                let usable = item
                    .and_then(|d| d.use_effect.as_ref())
                    .is_some_and(|effect| !needs_enemy(effect) || self.has_living_enemy());
                let action = if usable {
                    Some(GameAction::UseItem(stack.item_id.clone(), None))
                } else {
                    gear.map(|g| GameAction::Equip(g.id.to_owned()))
                };

                Carried {
                    key: action.as_ref().and_then(|_| key.next()),
                    label,
                    detail: item
                        .map(|d| d.description.to_owned())
                        .or_else(|| gear.map(gear_summary))
                        .or_else(|| {
                            content::material_description(&stack.item_id).map(str::to_owned)
                        }),
                    action,
                }
            })
            .collect()
    }

    fn has_living_enemy(&self) -> bool {
        self.state.enemies.iter().any(|e| e.hp > 0)
    }

    /// Recipes the player could make here, keyed for the board. The engine
    /// only allows crafting in a city or at a merchant, so the list is empty
    /// anywhere else rather than offered and refused.
    fn recipes(&self) -> Vec<Offer> {
        if !matches!(self.state.phase, GamePhase::Merchant | GamePhase::City) {
            return Vec::new();
        }
        let me = self.state.player(self.actor);
        let mut keys = KeyRun::digits();
        bevy_dungeon::proto_bridge::available_recipes(&me.inventory, &me.skills)
            .into_iter()
            .map(|recipe| {
                let qty = if recipe.output_qty > 1 {
                    format!(" x{}", recipe.output_qty)
                } else {
                    String::new()
                };
                let parts: Vec<String> = recipe
                    .ingredients
                    .iter()
                    .map(|(_, name, amount)| format!("{name} x{amount}"))
                    .collect();
                Offer {
                    key: keys.next(),
                    label: format!("{}{qty} - {}", recipe.output_name, parts.join(", ")),
                    id: recipe.output_ref.to_owned(),
                }
            })
            .collect()
    }

    /// Whether there is a counter to stand at. Buying and selling are legal in
    /// the city and at a merchant, and nowhere else.
    fn trading(&self) -> bool {
        matches!(self.state.phase, GamePhase::Merchant | GamePhase::City)
            && !self.state.room.merchant_stock.is_empty()
    }

    /// What the merchant will trade, split into what the caller can afford to
    /// buy and what they are carrying that is worth selling.
    fn stall(&self) -> (Vec<Offer>, Vec<Offer>) {
        let me = self.state.player(self.actor);
        let mut buy_keys = KeyRun::digits();
        let buy = self
            .state
            .room
            .merchant_stock
            .iter()
            .map(|offer| {
                let name = if offer.is_gear {
                    content::find_gear(&offer.item_id).map(|g| g.name)
                } else {
                    content::find_item(&offer.item_id).map(|d| d.name)
                };
                let affordable = me.gold >= offer.price
                    && (!me.inventory_full() || types::inv_contains(&me.inventory, &offer.item_id));
                Offer {
                    key: affordable.then(|| buy_keys.next()).flatten(),
                    label: format!(
                        "{} - {}g",
                        name.unwrap_or(offer.item_id.as_str()),
                        offer.price
                    ),
                    id: offer.item_id.clone(),
                }
            })
            .collect();

        let mut sell_keys = KeyRun::letters();
        let sell = types::inv_to_legacy(&me.inventory)
            .into_iter()
            .filter(|stack| stack.qty > 0)
            .filter_map(|stack| {
                let price = content::sell_price_for_gear(&stack.item_id)
                    .or_else(|| content::sell_price_for_item(&stack.item_id))?;
                let name = content::find_item(&stack.item_id)
                    .map(|d| d.name)
                    .or_else(|| content::find_gear(&stack.item_id).map(|g| g.name))
                    .unwrap_or(stack.item_id.as_str())
                    .to_owned();
                Some(Offer {
                    key: sell_keys.next(),
                    label: format!("{name} - {price}g"),
                    id: stack.item_id,
                })
            })
            .collect();

        (buy, sell)
    }

    /// Every action the current phase will actually accept, keyed for the
    /// board. Drawing and input both read this, so the menu can never offer a
    /// move the engine is going to refuse.
    fn actions(&self) -> Vec<(char, String, Act)> {
        let mut out: Vec<(char, String, Act)> = Vec::new();

        match self.state.phase {
            GamePhase::Combat | GamePhase::WaitingForActions => {
                out.push(('A', "Attack".to_string(), Act::Do(GameAction::Attack)));
                out.push(('D', "Defend".to_string(), Act::Do(GameAction::Defend)));
                out.push(('F', "Flee".to_string(), Act::Do(GameAction::Flee)));
            }
            GamePhase::GameOver(_) => {}
            GamePhase::Trap => {
                out.push((
                    '1',
                    "Disarm".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push(('2', "Brace".to_string(), Act::Do(GameAction::RoomChoice(1))));
            }
            GamePhase::Treasure => {
                out.push((
                    '1',
                    "Open carefully".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push((
                    '2',
                    "Force open".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Hallway => {
                out.push((
                    '1',
                    "Move quickly".to_string(),
                    Act::Do(GameAction::RoomChoice(0)),
                ));
                out.push((
                    '2',
                    "Search".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Rest if self.state.room.room_type == RoomType::RestShrine => {
                out.push(('1', "Rest".to_string(), Act::Do(GameAction::RoomChoice(0))));
                out.push((
                    '2',
                    "Meditate".to_string(),
                    Act::Do(GameAction::RoomChoice(1)),
                ));
            }
            GamePhase::Gathering => {
                let me = self.state.player(self.actor);
                for (i, node) in self.state.room.resource_nodes.iter().enumerate().take(9) {
                    if node.remaining == 0 || !skills::can_gather(&me.skills, &node.item_ref) {
                        continue;
                    }
                    let key = char::from_digit(i as u32 + 1, 10).unwrap_or('1');
                    out.push((
                        key,
                        format!("Work {} ({} left)", node.name, node.remaining),
                        Act::Do(GameAction::RoomChoice(i as u8)),
                    ));
                }
            }
            GamePhase::Event => {
                if let Some(event) = &self.state.room.story_event {
                    for (i, choice) in event.choices.iter().enumerate().take(9) {
                        let key = char::from_digit(i as u32 + 1, 10).unwrap_or('1');
                        out.push((
                            key,
                            choice.label.clone(),
                            Act::Do(GameAction::StoryChoice(i)),
                        ));
                    }
                }
            }
            _ => {}
        }

        if matches!(self.state.phase, GamePhase::Exploring | GamePhase::City) {
            for dir in self.exits() {
                let key = match dir {
                    Direction::North => 'N',
                    Direction::South => 'S',
                    Direction::East => 'E',
                    Direction::West => 'W',
                };
                out.push((
                    key,
                    format!("Go {}", dir.code()),
                    Act::Do(GameAction::Move(dir)),
                ));
            }
        }

        if self.state.phase == GamePhase::City {
            let cost = logic::inn_cost(&self.state);
            if self.state.player(self.actor).gold >= cost {
                out.push(('R', format!("Rest ({cost}g)"), Act::Do(GameAction::Rest)));
            }
        }

        match self.state.phase {
            GamePhase::GameOver(_) => out.push(('N', "New run".to_string(), Act::Restart)),
            GamePhase::Exploring => {
                out.push(('C', "Search".to_string(), Act::Do(GameAction::Explore)))
            }
            _ if out.is_empty() => {
                out.push(('C', "Continue".to_string(), Act::Do(GameAction::Explore)))
            }
            _ => {}
        }

        out
    }

    /// What the engine last said, for views that do not draw the log. Without
    /// this a purchase or a craft looks like it did nothing at all.
    fn draw_last_log(&self, screen: &mut Screen) {
        let Some(entry) = self.state.log.last() else {
            return;
        };
        let width = screen.width.saturating_sub(1);
        screen.nl().ink(Ink::Body);
        for line in wrap_lines(&strip_markup(entry), width) {
            screen.line(&line);
        }
        screen.reset();
    }

    /// Whatever the engine last refused, in the caller's width.
    fn draw_notice(&self, screen: &mut Screen) {
        let Some(notice) = &self.notice else {
            return;
        };
        let width = screen.width.saturating_sub(1);
        screen.nl().ink(Ink::Warn);
        for line in wrap_lines(&strip_markup(notice), width) {
            screen.line(&line);
        }
        screen.reset();
    }

    fn frame(&self) -> Frame {
        let me = self.state.player(self.actor);
        let party = vec![Actor {
            name: me.name.clone(),
            hp: me.hp,
            max_hp: me.max_hp,
        }];

        let enemies = self
            .state
            .enemies
            .iter()
            .filter(|e| e.hp > 0)
            .map(|e| Actor {
                name: e.name.clone(),
                hp: e.hp,
                max_hp: e.max_hp,
            })
            .collect();

        let mut options: Vec<(char, String)> = self
            .actions()
            .into_iter()
            .map(|(key, label, _)| (key, label))
            .collect();
        options.push(('M', "Map".to_string()));
        if !self.items().is_empty() {
            options.push(('I', "Pack".to_string()));
        }
        if self.trading() {
            options.push(('B', "Trade".to_string()));
        }
        if !self.recipes().is_empty() {
            options.push(('K', "Craft".to_string()));
        }

        Frame {
            room: format!("{} - {}", self.state.room.name, self.state.room.description),
            party,
            enemies,
            log: self.state.log.clone(),
            options,
        }
    }

    fn grid(&self, span: i16) -> Grid {
        let here = self.state.map.position;
        let size = (span * 2 + 1) as usize;
        let mut grid = Grid::new(size, size);

        for dy in -span..=span {
            for dx in -span..=span {
                let pos = MapPos {
                    x: here.x + dx,
                    y: here.y + dy,
                };
                let Some(tile) = self.state.map.tiles.get(&pos) else {
                    continue;
                };
                let visibility = content::tile_visibility(&self.state.map, pos);
                if visibility == TileVisibility::Hidden && pos != here {
                    continue;
                }

                let cell = if pos == here {
                    Cell::Current
                } else if visibility == TileVisibility::Discovered {
                    Cell::Discovered
                } else {
                    match tile.room_type {
                        RoomType::Boss => Cell::Boss,
                        RoomType::Merchant => Cell::Shop,
                        RoomType::RestShrine => Cell::Shrine,
                        RoomType::UndergroundCity => Cell::Exit,
                        _ if tile.cleared => Cell::Cleared,
                        _ => Cell::Visited,
                    }
                };

                let links = if visibility == TileVisibility::Discovered {
                    Links::NONE
                } else {
                    Links {
                        north: tile.exits.contains(&Direction::North),
                        south: tile.exits.contains(&Direction::South),
                        east: tile.exits.contains(&Direction::East),
                        west: tile.exits.contains(&Direction::West),
                    }
                };

                grid.set((dx + span) as usize, (dy + span) as usize, cell, links);
            }
        }
        grid
    }
}

impl Game for Run {
    fn title(&self) -> &str {
        "DUNGEONS"
    }

    fn draw(&self, screen: &mut Screen) {
        let me = self.state.player(self.actor);
        screen
            .nl()
            .ink(Ink::Dim)
            .line(&format!(
                "depth {}  gold {}  lv {}",
                self.state.map.position.depth(),
                me.gold,
                me.level
            ))
            .reset();

        match self.view {
            View::Map => {
                let across = map::fits(screen, (MAP_SPAN * 2 + 1) as usize);
                let span = ((across as i16 - 1) / 2).max(1);
                map::draw(screen, &self.grid(span));
                screen.nl();
                map::legend(screen);
                screen.nl();
                screen.item('Q', "Back");
            }
            View::Items => {
                let items = self.items();
                screen.nl().ink(Ink::Accent).line("pack").reset();
                if items.is_empty() {
                    screen.ink(Ink::Dim).line("nothing carried").reset();
                }
                for carried in &items {
                    draw_row(
                        screen,
                        carried.key,
                        &carried.label,
                        carried.detail.as_deref(),
                    );
                }
                self.draw_notice(screen);
                screen.nl();
                screen.item('Q', "Back");
            }
            View::Craft => {
                let recipes = self.recipes();
                screen.nl().ink(Ink::Accent).line("workbench").reset();
                if recipes.is_empty() {
                    screen
                        .ink(Ink::Dim)
                        .line("nothing you can make from what you carry")
                        .reset();
                }
                for recipe in &recipes {
                    draw_row(screen, recipe.key, &recipe.label, None);
                }
                self.draw_last_log(screen);
                self.draw_notice(screen);
                screen.nl();
                screen.item('Q', "Back");
            }
            View::Shop => {
                let (buy, sell) = self.stall();
                screen.nl().ink(Ink::Accent).line("for sale").reset();
                if buy.is_empty() {
                    screen.ink(Ink::Dim).line("the stall is bare").reset();
                }
                for offer in &buy {
                    draw_row(screen, offer.key, &offer.label, None);
                }

                if !sell.is_empty() {
                    screen.nl().ink(Ink::Accent).line("they will buy").reset();
                    for offer in &sell {
                        draw_row(screen, offer.key, &offer.label, None);
                    }
                }

                self.draw_last_log(screen);
                self.draw_notice(screen);
                screen.nl();
                screen.item('Q', "Back");
            }
            View::Play => {
                draw_frame(screen, &self.frame());
                self.draw_notice(screen);
                let footer = if self.guest {
                    "guest run - progress is not saved"
                } else {
                    "progress is not saved yet"
                };
                screen.ink(Ink::Dim).line(footer).reset();
                screen.item('Q', "Back");
            }
        }
        screen.prompt("command> ");
    }

    fn on_key(&mut self, key: char) -> Flow {
        if self.view == View::Map {
            if matches!(key, 'Q' | 'M') {
                self.view = View::Play;
            }
            return Flow::Continue;
        }

        if self.view == View::Items {
            match key {
                'Q' | 'I' => {
                    self.view = View::Play;
                    self.notice = None;
                }
                _ => {
                    if let Some(action) = self
                        .items()
                        .into_iter()
                        .find(|c| c.key == Some(key))
                        .and_then(|c| c.action)
                    {
                        self.act(action);
                    }
                }
            }
            return Flow::Continue;
        }

        if self.view == View::Craft {
            match key {
                'Q' | 'K' => {
                    self.view = View::Play;
                    self.notice = None;
                }
                _ => {
                    if let Some(recipe) = self.recipes().into_iter().find(|r| r.key == Some(key)) {
                        self.act(GameAction::Craft(recipe.id));
                    }
                }
            }
            return Flow::Continue;
        }

        if self.view == View::Shop {
            match key {
                'Q' | 'B' => {
                    self.view = View::Play;
                    self.notice = None;
                }
                _ => {
                    let (buy, sell) = self.stall();
                    if let Some(offer) = buy.into_iter().find(|o| o.key == Some(key)) {
                        self.act(GameAction::Buy(offer.id));
                    } else if let Some(offer) = sell.into_iter().find(|o| o.key == Some(key)) {
                        self.act(GameAction::Sell(offer.id));
                    }
                }
            }
            return Flow::Continue;
        }

        match key {
            'Q' => return Flow::Exit,
            'M' => self.view = View::Map,
            'K' if !self.recipes().is_empty() => {
                self.view = View::Craft;
                self.notice = None;
            }
            'B' if self.trading() => {
                self.view = View::Shop;
                self.notice = None;
            }
            'I' => {
                self.view = View::Items;
                self.notice = None;
            }
            _ => {
                let bound = self
                    .actions()
                    .into_iter()
                    .find(|(k, _, _)| *k == key)
                    .map(|(_, _, act)| act);
                match bound {
                    Some(Act::Do(action)) => self.act(action),
                    Some(Act::Restart) => {
                        let me = self.state.player(self.actor);
                        let (name, class) = (me.name.clone(), me.class);
                        self.state = start_solo(self.actor, &name, class);
                        self.notice = None;
                    }
                    None => {}
                }
            }
        }
        Flow::Continue
    }
}
