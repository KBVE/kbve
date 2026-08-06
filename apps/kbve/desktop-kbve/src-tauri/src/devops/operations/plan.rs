//! Epic planning operations: parse markdown plans and generate Epic + Sub-issues.
//!
//! This module uses an AI agent (via claude-code, aider, etc.) to:
//! 1. Read a project plan markdown file
//! 2. Analyze the plan and extract Epic structure
//! 3. Generate Epic issue configuration
//! 4. Generate N sub-issue configurations
//! 5. Create Epic + Sub-issues on GitHub

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::devops::operations;

/// Helper: Determine which agent to use for planning
fn determine_planning_agent(
    config: &PlanFromMarkdownConfig,
    enabled_agents: &[String],
) -> Result<String, String> {
    // If user specified an agent, check if it's enabled
    if let Some(requested_agent) = &config.planning_agent {
        if !enabled_agents.contains(requested_agent) {
            return Err(format!(
                "Agent '{}' is not enabled. Enable it in DevOps settings first. Enabled agents: {}",
                requested_agent,
                enabled_agents.join(", ")
            ));
        }
        return Ok(requested_agent.clone());
    }

    // Otherwise, use first enabled agent
    enabled_agents.first().cloned().ok_or_else(|| {
        "No agents enabled. Enable at least one agent (claude, aider, etc.) in DevOps settings."
            .to_string()
    })
}

/// Configuration for planning an Epic from a markdown file
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PlanFromMarkdownConfig {
    /// Path to the markdown plan file
    pub plan_file_path: String,
    /// Tracking repository where Epic/Sub-issues are created (e.g., "KBVE/Handy")
    pub repo: String,
    /// Work repository where code lives and agents work (e.g., "user/project")
    /// If None, defaults to same as repo
    pub work_repo: Option<String>,
    /// Optional: Override epic title
    pub title_override: Option<String>,
    /// Optional: Agent to use for planning (default: claude)
    pub planning_agent: Option<String>,
}

/// Result of the planning operation
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct PlanResult {
    /// Created Epic info
    pub epic: operations::EpicInfo,
    /// Created sub-issues
    pub sub_issues: Vec<operations::SubIssueInfo>,
    /// Agent used for planning
    pub planning_agent: String,
    /// Summary of what was created
    pub summary: String,
}

/// Plan an Epic from a markdown file using an AI agent
///
/// This function:
/// 1. Reads the markdown plan file
/// 2. Spawns a planning agent (claude/aider) to analyze it
/// 3. Agent extracts Epic structure (title, phases, sub-issues)
/// 4. Creates Epic issue on GitHub
/// 5. Creates all sub-issues referencing the Epic
/// 6. Returns complete plan result
pub async fn plan_from_markdown(
    config: PlanFromMarkdownConfig,
    enabled_agents: Vec<String>,
) -> Result<PlanResult, String> {
    // Step 1: Determine which agent to use
    let agent_type = determine_planning_agent(&config, &enabled_agents)?;

    // Step 2: Read the markdown file
    let plan_content = std::fs::read_to_string(&config.plan_file_path)
        .map_err(|e| format!("Failed to read plan file: {}", e))?;

    // Step 3: Prepare planning prompt for the agent
    let planning_prompt = format!(
        r#"Analyze this project plan and generate Epic structure:

# Project Plan
{}

# Task
Extract from this plan:
1. Epic title (if not provided, use: {})
2. Epic goal (1-2 sentences)
3. Success metrics (checkbox list)
4. Phases with approach (manual/agent-assisted/automated)
5. Sub-issues for each phase with:
   - Title
   - Goal
   - Tasks breakdown
   - Acceptance criteria
   - Recommended agent type
   - Estimated time
   - Dependencies

# Output Format
Return ONLY valid JSON in this exact structure (no markdown, no explanation):
{{
  "epic": {{
    "title": "...",
    "goal": "...",
    "success_metrics": ["...", "..."],
    "phases": [
      {{"name": "...", "description": "...", "approach": "manual"}}
    ],
    "labels": ["...", "..."]
  }},
  "sub_issues": [
    {{
      "title": "...",
      "phase": 1,
      "estimated_time": "...",
      "dependencies": "...",
      "goal": "...",
      "tasks": "...",
      "acceptance_criteria": ["...", "..."],
      "agent_type": "claude"
    }}
  ]
}}
"#,
        plan_content,
        config
            .title_override
            .as_deref()
            .unwrap_or("Extracted from plan")
    );

    // Step 4: Spawn planning agent to analyze the plan
    let agent_output = spawn_planning_agent(&planning_prompt, &agent_type).await?;

    // Step 4: Parse agent's JSON output
    let plan_structure = parse_agent_output(&agent_output)?;

    // Step 5: Convert to Epic and SubIssue configurations
    let epic_config = operations::EpicConfig {
        title: plan_structure.epic.title.clone(),
        repo: config.repo.clone(),
        work_repo: config.work_repo.clone(),
        goal: plan_structure.epic.goal,
        success_metrics: plan_structure.epic.success_metrics,
        phases: plan_structure.epic.phases,
        labels: plan_structure.epic.labels,
    };

    let sub_issue_configs: Vec<operations::SubIssueConfig> = plan_structure
        .sub_issues
        .iter()
        .map(|sub| operations::SubIssueConfig {
            title: sub.title.clone(),
            phase: sub.phase,
            estimated_time: sub.estimated_time.clone(),
            dependencies: sub.dependencies.clone(),
            goal: sub.goal.clone(),
            tasks: sub.tasks.clone(),
            acceptance_criteria: sub.acceptance_criteria.clone(),
            agent_type: sub.agent_type.clone(),
            work_repo: None, // Will inherit from epic
        })
        .collect();

    // Step 6: Create Epic issue on GitHub
    let epic = operations::create_epic(epic_config).await?;

    // Step 7: Create all sub-issues (pass work_repo from epic)
    let sub_issues = operations::create_sub_issues(
        epic.epic_number,
        epic.repo.clone(),
        epic.work_repo.clone(),
        sub_issue_configs,
    )
    .await?;

    // Step 8: Generate summary
    let summary = format!(
        "Created Epic #{} '{}' with {} sub-issues using {} agent",
        epic.epic_number,
        plan_structure.epic.title,
        sub_issues.len(),
        agent_type
    );

    Ok(PlanResult {
        epic,
        sub_issues,
        planning_agent: agent_type.to_string(),
        summary,
    })
}

/// Helper: Parse agent output (JSON) into Epic and SubIssue configs
#[derive(Debug, Deserialize)]
struct PlanStructure {
    epic: EpicStructure,
    sub_issues: Vec<SubIssueStructure>,
}

#[derive(Debug, Deserialize)]
struct EpicStructure {
    title: String,
    goal: String,
    success_metrics: Vec<String>,
    phases: Vec<operations::PhaseConfig>,
    labels: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct SubIssueStructure {
    title: String,
    phase: u32,
    estimated_time: String,
    dependencies: String,
    goal: String,
    tasks: String,
    acceptance_criteria: Vec<String>,
    agent_type: String,
}

/// Helper: Spawn a planning agent and get its output
///
/// NOTE: This is a placeholder for the full agent integration.
/// Currently returns an error with instructions to use the agent system manually.
///
/// Future implementation will:
/// 1. Create a temporary planning issue with the prompt
/// 2. Spawn the agent using spawn_agent_from_issue()
/// 3. Wait for agent completion
/// 4. Extract JSON from agent's work
/// 5. Delete temporary issue
async fn spawn_planning_agent(_prompt: &str, agent_type: &str) -> Result<String, String> {
    // TODO: Integrate with existing agent spawning system
    // For now, return an error with manual instructions

    Err(format!(
        "Automated AI planning not yet implemented.\n\
         \n\
         To plan your Epic manually:\n\
         1. Read your markdown plan file\n\
         2. Create a planning GitHub issue with the plan content\n\
         3. Spawn a {} agent for that issue using spawn_agent_from_issue()\n\
         4. Agent analyzes plan and generates Epic structure JSON\n\
         5. Use the JSON output to create Epic + Sub-issues\n\
         \n\
         Full integration coming soon! For now, use the predefined Epic templates\n\
         in 'Epic Workflow - Predefined Plans' section.",
        agent_type
    ))
}

/// Helper: Parse agent output and extract JSON
fn parse_agent_output(output: &str) -> Result<PlanStructure, String> {
    // Try to extract JSON from markdown code blocks if present
    let json_str = if let Some(start) = output.find("```json") {
        let after_start = &output[start + 7..];
        if let Some(end) = after_start.find("```") {
            after_start[..end].trim()
        } else {
            output.trim()
        }
    } else if let Some(start) = output.find("```") {
        let after_start = &output[start + 3..];
        if let Some(end) = after_start.find("```") {
            after_start[..end].trim()
        } else {
            output.trim()
        }
    } else {
        output.trim()
    };

    // Parse JSON
    serde_json::from_str::<PlanStructure>(json_str).map_err(|e| {
        format!(
            "Failed to parse agent output as JSON: {}\n\nOutput was:\n{}",
            e, json_str
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_plan_structure_deserialization() {
        let json = r#"{
            "epic": {
                "title": "Test Epic",
                "goal": "Test goal",
                "success_metrics": ["Metric 1"],
                "phases": [
                    {"name": "Phase 1", "description": "Test", "approach": "manual"}
                ],
                "labels": ["test"]
            },
            "sub_issues": [
                {
                    "title": "Sub-issue 1",
                    "phase": 1,
                    "estimated_time": "2 hours",
                    "dependencies": "None",
                    "goal": "Test goal",
                    "tasks": "- Task 1",
                    "acceptance_criteria": ["Criterion 1"],
                    "agent_type": "claude"
                }
            ]
        }"#;

        let plan: PlanStructure = serde_json::from_str(json).unwrap();
        assert_eq!(plan.epic.title, "Test Epic");
        assert_eq!(plan.sub_issues.len(), 1);
    }
}
