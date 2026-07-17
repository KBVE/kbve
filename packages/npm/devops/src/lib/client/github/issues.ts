import { GitHubClient, GitHubContext, context as ghaContext } from './types';

async function createComment(
	github: GitHubClient,
	context: GitHubContext,
	body: string,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.createComment({
			owner,
			repo,
			issue_number,
			body,
		});
	} catch (error) {
		console.error('Error creating issue comment:', error);
		throw error;
	}
}

async function addReaction(
	github: GitHubClient,
	context: GitHubContext,
	comment_id: number,
	reaction: string,
): Promise<void> {
	try {
		const { owner, repo } = context.repo;

		await github.rest.reactions.createForIssueComment({
			owner,
			repo,
			comment_id,
			content: reaction,
		});
	} catch (error) {
		console.error('Error adding reaction:', error);
		throw error;
	}
}

async function removeLabel(
	github: GitHubClient,
	context: GitHubContext,
	labelName: string,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		const { data: labels } = await github.rest.issues.listLabelsOnIssue({
			owner,
			repo,
			issue_number,
		});

		if (labels.some((label) => label.name === labelName)) {
			await github.rest.issues.removeLabel({
				owner,
				repo,
				issue_number,
				name: labelName,
			});
		}
	} catch (error) {
		console.error(`Error removing label ${labelName} from issue:`, error);
		throw error;
	}
}

async function addLabel(
	github: GitHubClient,
	context: GitHubContext,
	labelName: string,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		const { data: labels } = await github.rest.issues.listLabelsOnIssue({
			owner,
			repo,
			issue_number,
		});

		if (!labels.some((label) => label.name === labelName)) {
			await github.rest.issues.addLabels({
				owner,
				repo,
				issue_number,
				labels: [labelName],
			});
		}
	} catch (error) {
		console.error(`Error adding label ${labelName} to issue:`, error);
		throw error;
	}
}

async function verifyMatrixLabel(
	github: GitHubClient,
	context: GitHubContext,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		const { data: labels } = await github.rest.issues.listLabelsOnIssue({
			owner,
			repo,
			issue_number,
		});

		const matrixLabels = ['0', '1', '2', '3', '4', '5', '6'];
		const presentLabels = labels
			.filter((label) => matrixLabels.includes(label.name))
			.map((label) => label.name)
			.sort((a, b) => parseInt(a) - parseInt(b));

		if (presentLabels.length === 0) {
			await addLabel(github, context, '0');
			console.log('No matrix labels present. Added label: 0');
		} else if (presentLabels.length > 1) {
			const highestLabel = presentLabels.pop();
			for (const label of presentLabels) {
				await removeLabel(github, context, label);
			}
			console.log(
				`Removed lower labels, kept highest label: ${highestLabel}`,
			);
		}
	} catch (error) {
		console.error('Error verifying matrix labels:', error);
		throw error;
	}
}

// Assignee Management

async function addAssignees(
	github: GitHubClient,
	context: GitHubContext,
	assignees: string[],
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.addAssignees({
			owner,
			repo,
			issue_number,
			assignees,
		});
	} catch (error) {
		console.error('Error adding assignees to issue:', error);
		throw error;
	}
}

async function removeAssignees(
	github: GitHubClient,
	context: GitHubContext,
	assignees: string[],
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.removeAssignees({
			owner,
			repo,
			issue_number,
			assignees,
		});
	} catch (error) {
		console.error('Error removing assignees from issue:', error);
		throw error;
	}
}

// Issue State Management

async function closeIssue(
	github: GitHubClient,
	context: GitHubContext,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.update({
			owner,
			repo,
			issue_number,
			state: 'closed',
		});
	} catch (error) {
		console.error('Error closing issue:', error);
		throw error;
	}
}

async function reopenIssue(
	github: GitHubClient,
	context: GitHubContext,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.update({
			owner,
			repo,
			issue_number,
			state: 'open',
		});
	} catch (error) {
		console.error('Error reopening issue:', error);
		throw error;
	}
}

async function lockIssue(
	github: GitHubClient,
	context: GitHubContext,
	lockReason?: string,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.lock({
			owner,
			repo,
			issue_number,
			lock_reason: lockReason,
		});
	} catch (error) {
		console.error('Error locking issue:', error);
		throw error;
	}
}

async function unlockIssue(
	github: GitHubClient,
	context: GitHubContext,
): Promise<void> {
	try {
		const { owner, repo, issue_number } = ghaContext.extractIssue(context);

		await github.rest.issues.unlock({
			owner,
			repo,
			issue_number,
		});
	} catch (error) {
		console.error('Error unlocking issue:', error);
		throw error;
	}
}

export const issues = {
	createComment,
	addReaction,
	removeLabel,
	addLabel,
	verifyMatrixLabel,
	addAssignees,
	removeAssignees,
	closeIssue,
	reopenIssue,
	lockIssue,
	unlockIssue,
};
