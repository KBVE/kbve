//! JSON loading for the Astro `/api/questdb.json` endpoint.
//!
//! The Astro endpoint serves quests with string enum values (`"main"`,
//! `"side"`) and Astro-specific extension fields. This module maps that
//! JSON shape into proto [`Quest`] structs that [`QuestDb`] can index.

use serde_json::Value;

use crate::proto::quest;

/// Errors that can occur when loading quests from JSON.
#[derive(Debug)]
pub enum JsonLoadError {
    /// Failed to parse the JSON string.
    Parse(serde_json::Error),
    /// The JSON structure is missing the expected `quests` array.
    MissingQuests,
}

impl std::fmt::Display for JsonLoadError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(e) => write!(f, "JSON parse error: {e}"),
            Self::MissingQuests => write!(f, "JSON missing 'quests' array"),
        }
    }
}

impl std::error::Error for JsonLoadError {}

/// Parse the Astro `/api/questdb.json` response into a list of proto quests.
///
/// The expected JSON shape is:
/// ```json
/// {
///   "quests": [ { "id": "...", "slug": "auto-cooker-9000", "title": "Auto Cooker 9000", ... } ],
///   "key": { "auto-cooker-9000": 0, ... }
/// }
/// ```
///
/// Astro-specific fields not in the proto schema are silently ignored.
pub fn parse_questdb_json(json_str: &str) -> Result<Vec<quest::Quest>, JsonLoadError> {
    let root: Value = serde_json::from_str(json_str).map_err(JsonLoadError::Parse)?;

    let quests_arr = root
        .get("quests")
        .and_then(|v| v.as_array())
        .ok_or(JsonLoadError::MissingQuests)?;

    let mut quests = Vec::with_capacity(quests_arr.len());
    for val in quests_arr {
        if let Some(q) = json_value_to_quest(val) {
            quests.push(q);
        }
    }

    Ok(quests)
}

fn json_value_to_quest(v: &Value) -> Option<quest::Quest> {
    let slug = v.get("slug")?.as_str()?.to_string();
    let id = v
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = v
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or(&slug)
        .to_string();

    Some(quest::Quest {
        id,
        slug,
        title,
        description: str_opt(v, "description"),
        lore: str_opt(v, "lore"),
        category: parse_category(v.get("category")),
        tags: str_array(v, "tags"),
        icon: str_opt(v, "icon"),
        img: str_opt(v, "img"),
        marker_icon: str_opt(v, "marker_icon"),
        prerequisites: parse_prerequisites(v.get("prerequisites")),
        hidden: bool_opt(v, "hidden"),
        repeatable: bool_opt(v, "repeatable"),
        auto_accept: bool_opt(v, "auto_accept"),
        auto_complete: bool_opt(v, "auto_complete"),
        shareable: bool_opt(v, "shareable"),
        abandonable: bool_opt(v, "abandonable"),
        tracked: bool_opt(v, "tracked"),
        time_limits: parse_time_limits(v.get("time_limits")),
        steps: parse_steps(v.get("steps")),
        next_quest_ref: str_opt(v, "next_quest_ref"),
        chain_ref: str_opt(v, "chain_ref"),
        giver_npc_refs: str_array(v, "giver_npc_refs"),
        turn_in_npc_refs: str_array(v, "turn_in_npc_refs"),
        zone_refs: str_array(v, "zone_refs"),
        recommended_level: int_opt(v, "recommended_level"),
        recommended_party_size: int_opt(v, "recommended_party_size"),
        rewards: parse_rewards(v.get("rewards")),
        outcomes: parse_outcomes(v.get("outcomes")),
        repeat_rewards: parse_repeat_rewards(v.get("repeat_rewards")),
        reward_policy: v
            .get("reward_policy")
            .map(|rp| parse_reward_policy(Some(rp))),
        failure_policy: v
            .get("failure_policy")
            .map(|fp| parse_failure_policy(Some(fp))),
        dialogue_hooks: parse_dialogue_hooks(v.get("dialogue_hooks")),
        triggers: str_array(v, "triggers"),
        required_flags: str_array(v, "required_flags"),
        blocked_by_flags: str_array(v, "blocked_by_flags"),
        extensions: parse_extensions(v.get("extensions")),
        credits: str_opt(v, "credits"),
        drafted: bool_opt(v, "drafted"),
    })
}

// ---------------------------------------------------------------------------
// Enum parsers (string → i32)
// ---------------------------------------------------------------------------

fn parse_category(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("main") => quest::QuestCategory::Main as i32,
        Some("side") => quest::QuestCategory::Side as i32,
        Some("daily") => quest::QuestCategory::Daily as i32,
        Some("event") => quest::QuestCategory::Event as i32,
        Some("challenge") => quest::QuestCategory::Challenge as i32,
        Some("tutorial") => quest::QuestCategory::Tutorial as i32,
        Some("bounty") => quest::QuestCategory::Bounty as i32,
        Some("guild") => quest::QuestCategory::Guild as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_objective_type(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("collect") => quest::ObjectiveType::ObjectiveCollect as i32,
        Some("kill") => quest::ObjectiveType::ObjectiveKill as i32,
        Some("visit") => quest::ObjectiveType::ObjectiveVisit as i32,
        Some("interact") => quest::ObjectiveType::ObjectiveInteract as i32,
        Some("escort") => quest::ObjectiveType::ObjectiveEscort as i32,
        Some("defend") => quest::ObjectiveType::ObjectiveDefend as i32,
        Some("craft") => quest::ObjectiveType::ObjectiveCraft as i32,
        Some("explore") => quest::ObjectiveType::ObjectiveExplore as i32,
        Some("custom") => quest::ObjectiveType::ObjectiveCustom as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_consequence_type(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("none") => quest::ChoiceConsequenceType::ConsequenceNone as i32,
        Some("advance_quest") => quest::ChoiceConsequenceType::ConsequenceAdvanceQuest as i32,
        Some("fail_quest") => quest::ChoiceConsequenceType::ConsequenceFailQuest as i32,
        Some("branch_quest") => quest::ChoiceConsequenceType::ConsequenceBranchQuest as i32,
        Some("give_item") => quest::ChoiceConsequenceType::ConsequenceGiveItem as i32,
        Some("take_item") => quest::ChoiceConsequenceType::ConsequenceTakeItem as i32,
        Some("reputation") => quest::ChoiceConsequenceType::ConsequenceReputation as i32,
        Some("spawn_enemy") => quest::ChoiceConsequenceType::ConsequenceSpawnEnemy as i32,
        Some("teleport") => quest::ChoiceConsequenceType::ConsequenceTeleport as i32,
        Some("unlock") => quest::ChoiceConsequenceType::ConsequenceUnlock as i32,
        Some("set_flag") => quest::ChoiceConsequenceType::ConsequenceSetFlag as i32,
        Some("clear_flag") => quest::ChoiceConsequenceType::ConsequenceClearFlag as i32,
        Some("npc_disposition") => quest::ChoiceConsequenceType::ConsequenceNpcDisposition as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_failure_policy(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("permanent") => quest::FailurePolicy::FailurePermanent as i32,
        Some("retry_step") => quest::FailurePolicy::FailureRetryStep as i32,
        Some("retry_quest") => quest::FailurePolicy::FailureRetryQuest as i32,
        Some("soft_fail") => quest::FailurePolicy::FailureSoftFail as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

fn parse_reward_policy(v: Option<&Value>) -> i32 {
    match v.and_then(|v| v.as_str()) {
        Some("individual") => quest::RewardPolicy::RewardIndividual as i32,
        Some("shared") => quest::RewardPolicy::RewardShared as i32,
        Some("leader") => quest::RewardPolicy::RewardLeader as i32,
        _ => v.and_then(|v| v.as_i64()).unwrap_or(0) as i32,
    }
}

// ---------------------------------------------------------------------------
// Sub-message parsers
// ---------------------------------------------------------------------------

fn parse_objective(v: &Value) -> Option<quest::QuestObjective> {
    let obj = v.as_object()?;
    Some(quest::QuestObjective {
        id: obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        description: obj
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        r#type: parse_objective_type(obj.get("type")),
        target_refs: str_array_from(obj.get("target_refs")),
        required_amount: obj
            .get("required_amount")
            .and_then(|v| v.as_i64())
            .unwrap_or(1) as i32,
        optional: obj.get("optional").and_then(|v| v.as_bool()),
        hidden: obj.get("hidden").and_then(|v| v.as_bool()),
        reveal_trigger: obj
            .get("reveal_trigger")
            .and_then(|v| v.as_str())
            .map(String::from),
        order: obj.get("order").and_then(|v| v.as_i64()).map(|n| n as i32),
        zone_ref: obj
            .get("zone_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

fn parse_item_reward(v: &Value) -> Option<quest::QuestItemReward> {
    let obj = v.as_object()?;
    Some(quest::QuestItemReward {
        item_ref: obj.get("item_ref")?.as_str()?.to_string(),
        item_name: obj
            .get("item_name")
            .and_then(|v| v.as_str())
            .map(String::from),
        amount: obj.get("amount").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
    })
}

fn parse_achievement(v: Option<&Value>) -> Option<quest::AchievementMeta> {
    let v = v?.as_object()?;
    Some(quest::AchievementMeta {
        api_name: v
            .get("api_name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        name: v.get("name").and_then(|v| v.as_str()).map(String::from),
        description: v
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
        icon_achieved: v
            .get("icon_achieved")
            .and_then(|v| v.as_str())
            .map(String::from),
        icon_unachieved: v
            .get("icon_unachieved")
            .and_then(|v| v.as_str())
            .map(String::from),
        global_percent: v
            .get("global_percent")
            .and_then(|v| v.as_f64())
            .map(|n| n as f32),
        hidden: v.get("hidden").and_then(|v| v.as_bool()),
        min_value: v
            .get("min_value")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        max_value: v
            .get("max_value")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
    })
}

fn parse_rewards(v: Option<&Value>) -> Option<quest::QuestRewards> {
    let v = v?.as_object()?;
    Some(quest::QuestRewards {
        items: v
            .get("items")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(parse_item_reward).collect())
            .unwrap_or_default(),
        currency: v.get("currency").and_then(|v| v.as_i64()).map(|n| n as i32),
        xp: v.get("xp").and_then(|v| v.as_i64()).map(|n| n as i32),
        bonuses: v
            .get("bonuses")
            .and_then(|v| v.as_object())
            .map(|m| {
                m.iter()
                    .filter_map(|(k, v)| Some((k.clone(), v.as_f64()?)))
                    .collect()
            })
            .unwrap_or_default(),
        achievement: parse_achievement(v.get("achievement")),
        unlock_ref: v
            .get("unlock_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        unlock_quest_refs: str_array_from(v.get("unlock_quest_refs")),
        reputation_amount: v
            .get("reputation_amount")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        reputation_faction: v
            .get("reputation_faction")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

fn parse_choice(v: &Value) -> Option<quest::QuestChoice> {
    let obj = v.as_object()?;
    Some(quest::QuestChoice {
        id: obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        label: obj
            .get("label")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        description: obj
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
        consequence: parse_consequence_type(obj.get("consequence")),
        consequence_ref: obj
            .get("consequence_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        consequence_value: obj
            .get("consequence_value")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        next_step_id: obj
            .get("next_step_id")
            .and_then(|v| v.as_str())
            .map(String::from),
        required_item_refs: str_array_from(obj.get("required_item_refs")),
        required_class: obj
            .get("required_class")
            .and_then(|v| v.as_str())
            .map(String::from),
        outcome_id: obj
            .get("outcome_id")
            .and_then(|v| v.as_str())
            .map(String::from),
        set_flags: str_array_from(obj.get("set_flags")),
        dialogue_node_ref: obj
            .get("dialogue_node_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

fn parse_outcome(v: &Value) -> Option<quest::QuestOutcome> {
    let obj = v.as_object()?;
    Some(quest::QuestOutcome {
        id: obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        description: obj
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        rewards: parse_rewards(obj.get("rewards")),
        next_quest_ref: obj
            .get("next_quest_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        consequence_flags: str_array_from(obj.get("consequence_flags")),
        ending_type: obj
            .get("ending_type")
            .and_then(|v| v.as_str())
            .map(String::from),
        canonical: obj.get("canonical").and_then(|v| v.as_bool()),
    })
}

fn parse_outcomes(v: Option<&Value>) -> Vec<quest::QuestOutcome> {
    v.and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(parse_outcome).collect())
        .unwrap_or_default()
}

fn parse_dialogue_hooks(v: Option<&Value>) -> Option<quest::QuestDialogueHooks> {
    let v = v?.as_object()?;
    Some(quest::QuestDialogueHooks {
        accept_ref: v
            .get("accept_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        in_progress_ref: v
            .get("in_progress_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        complete_ref: v
            .get("complete_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        turn_in_ref: v
            .get("turn_in_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        fail_ref: v.get("fail_ref").and_then(|v| v.as_str()).map(String::from),
        abandon_ref: v
            .get("abandon_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
}

fn parse_step(v: &Value) -> Option<quest::QuestStep> {
    let obj = v.as_object()?;
    Some(quest::QuestStep {
        id: obj
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        title: obj.get("title").and_then(|v| v.as_str()).map(String::from),
        description: obj
            .get("description")
            .and_then(|v| v.as_str())
            .map(String::from),
        speaker_ref: obj
            .get("speaker_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        objectives: obj
            .get("objectives")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(parse_objective).collect())
            .unwrap_or_default(),
        choices: obj
            .get("choices")
            .and_then(|v| v.as_array())
            .map(|a| a.iter().filter_map(parse_choice).collect())
            .unwrap_or_default(),
        next_step_id: obj
            .get("next_step_id")
            .and_then(|v| v.as_str())
            .map(String::from),
        step_rewards: parse_rewards(obj.get("step_rewards")),
        trigger_on_start: obj
            .get("trigger_on_start")
            .and_then(|v| v.as_str())
            .map(String::from),
        trigger_on_complete: obj
            .get("trigger_on_complete")
            .and_then(|v| v.as_str())
            .map(String::from),
        parallel: obj.get("parallel").and_then(|v| v.as_bool()),
        auto_complete: obj.get("auto_complete").and_then(|v| v.as_bool()),
        hidden: obj.get("hidden").and_then(|v| v.as_bool()),
        skippable: obj.get("skippable").and_then(|v| v.as_bool()),
        failure_policy: obj
            .get("failure_policy")
            .map(|fp| parse_failure_policy(Some(fp))),
        step_time_limit_secs: obj
            .get("step_time_limit_secs")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        dialogue_hooks: parse_dialogue_hooks(obj.get("dialogue_hooks")),
    })
}

fn parse_steps(v: Option<&Value>) -> Vec<quest::QuestStep> {
    v.and_then(|v| v.as_array())
        .map(|arr| arr.iter().filter_map(parse_step).collect())
        .unwrap_or_default()
}

fn parse_prerequisites(v: Option<&Value>) -> Option<quest::QuestPrerequisite> {
    let v = v?.as_object()?;
    Some(quest::QuestPrerequisite {
        level_requirement: v
            .get("level_requirement")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        quest_refs: str_array_from(v.get("quest_refs")),
        faction_ref: v
            .get("faction_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        faction_rank: v
            .get("faction_rank")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        item_refs: str_array_from(v.get("item_refs")),
        class_ref: v
            .get("class_ref")
            .and_then(|v| v.as_str())
            .map(String::from),
        trigger: v.get("trigger").and_then(|v| v.as_str()).map(String::from),
    })
}

fn parse_time_limits(v: Option<&Value>) -> Option<quest::QuestTimeLimits> {
    let v = v?.as_object()?;
    Some(quest::QuestTimeLimits {
        time_limit_secs: v
            .get("time_limit_secs")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        available_after: v
            .get("available_after")
            .and_then(|v| v.as_str())
            .map(String::from),
        available_until: v
            .get("available_until")
            .and_then(|v| v.as_str())
            .map(String::from),
        cooldown_secs: v
            .get("cooldown_secs")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
        daily_reset_hour: v
            .get("daily_reset_hour")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32),
    })
}

fn parse_repeat_rewards(v: Option<&Value>) -> Option<quest::RepeatRewards> {
    let v = v?.as_object()?;
    Some(quest::RepeatRewards {
        first_time: parse_rewards(v.get("first_time")),
        repeat: parse_rewards(v.get("repeat")),
    })
}

fn parse_extensions(v: Option<&Value>) -> Vec<quest::QuestExtension> {
    v.and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|e| {
                    let obj = e.as_object()?;
                    let key = obj.get("key")?.as_str()?.to_string();
                    let value = if let Some(s) = obj.get("string_value").and_then(|v| v.as_str()) {
                        Some(quest::quest_extension::Value::StringValue(s.to_string()))
                    } else if let Some(n) = obj.get("int_value").and_then(|v| v.as_i64()) {
                        Some(quest::quest_extension::Value::IntValue(n))
                    } else if let Some(n) = obj.get("float_value").and_then(|v| v.as_f64()) {
                        Some(quest::quest_extension::Value::FloatValue(n))
                    } else {
                        obj.get("bool_value")
                            .and_then(|v| v.as_bool())
                            .map(quest::quest_extension::Value::BoolValue)
                    };
                    Some(quest::QuestExtension { key, value })
                })
                .collect()
        })
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn str_opt(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|v| v.as_str()).map(String::from)
}

fn int_opt(v: &Value, key: &str) -> Option<i32> {
    v.get(key).and_then(|v| v.as_i64()).map(|n| n as i32)
}

fn bool_opt(v: &Value, key: &str) -> Option<bool> {
    v.get(key).and_then(|v| v.as_bool())
}

fn str_array(v: &Value, key: &str) -> Vec<String> {
    str_array_from(v.get(key))
}

fn str_array_from(v: Option<&Value>) -> Vec<String> {
    v.and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default()
}
