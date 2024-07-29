import { _title, sanitizePort, sanitizeContainerName, sanitizeContainerImage } from '../sanitization';
import { exec } from 'child_process';

export interface GithubActionReferenceMap {
  keyword: string;
  action: string;
}

export function _$gha_findActionInTitle(
  title: string,
  referenceMap: GithubActionReferenceMap[],
): string {
  const sanitizedTitle = _title(title);

  for (const item of referenceMap) {
    if (sanitizedTitle.includes(item.keyword)) {
      return item.action;
    }
  }
  throw new Error('No matching keyword found in title');
}

const defaultReferenceMap: GithubActionReferenceMap[] = [
  { keyword: 'atlas', action: 'atlas_action' },
  { keyword: 'music', action: 'music_action' },
  // Add more default mappings as needed
];

export function _$gha_kbve_ActionProcess(title: string): string {
  return _$gha_findActionInTitle(title.toLowerCase(), defaultReferenceMap);
}

export async function _$gha_createIssueComment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  body: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

export async function _$gha_addReaction(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  comment_id: number,
  reaction: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;

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

export async function _$gha_removeLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  labelName: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

    const { data: labels } = await github.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number,
    });

    if (labels.some((label: { name: string }) => label.name === labelName)) {
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

export async function _$gha_addLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  labelName: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

    const { data: labels } = await github.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number,
    });

    if (!labels.some((label: { name: string }) => label.name === labelName)) {
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

export async function _$gha_verifyMatrixLabel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

    const { data: labels } = await github.rest.issues.listLabelsOnIssue({
      owner,
      repo,
      issue_number,
    });

    const matrixLabels = ['0', '1', '2', '3', '4', '5', '6'];
    const presentLabels = labels
      .filter((label: { name: string }) => matrixLabels.includes(label.name))
      .map((label: { name: string }) => label.name)
      .sort((a: string, b: string) => parseInt(a) - parseInt(b));

    if (presentLabels.length === 0) {
      await _$gha_addLabel(github, context, '0');
      console.log('No matrix labels present. Added label: 0');
    } else if (presentLabels.length > 1) {
      const highestLabel = presentLabels.pop(); // Keep the highest label
      for (const label of presentLabels) {
        await _$gha_removeLabel(github, context, label);
      }
      console.log(`Removed lower labels, kept highest label: ${highestLabel}`);
    }
  } catch (error) {
    console.error('Error verifying matrix labels:', error);
    throw error;
  }
}

// Assignee Management

export async function _$gha_addAssignees(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  assignees: string[],
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

export async function _$gha_removeAssignees(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  assignees: string[],
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

// Issue Management

export async function _$gha_closeIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

export async function _$gha_reopenIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

export async function _$gha_lockIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  lockReason?: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

export async function _$gha_unlockIssue(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const issue_number = context.issue.number;

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

//! - Github Docker Commands - Proof of Concept - 07-26-2024

export async function _$gha_runDockerContainer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  port: number,
  name: string,
  image: string,
  
): Promise<void> {
  return new Promise((resolve, reject) => {

    let sanitizedPort, sanitizedName, sanitizedImage;

    try {
      sanitizedPort = sanitizePort(port);
      sanitizedName = sanitizeContainerName(name);
      sanitizedImage = sanitizeContainerImage(image);
    } catch (error) {
      console.error('Error sanitizing input:', error);
      reject(error);
      return;
    }
    

    const command = `docker run -d -p ${sanitizedPort}:${sanitizedPort} --name ${sanitizedName} ${sanitizedImage}`;

    exec(command, async (error, stdout, stderr) => {
      if (error) {
        console.error('Error running Docker container:', error);
        await _$gha_createIssueComment(
          github,
          context,
          `Error running Docker container: ${error.message}`,
        );
        reject(error);
      } else {
        console.log('Docker container started successfully:', stdout);
        await _$gha_createIssueComment(
          github,
          context,
          `Docker container started successfully: ${stdout}`,
        );
        resolve();
      }
    });
  });
}

export async function _$gha_stopDockerContainer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  name: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let sanitizedName: string;

    try {
      sanitizedName = sanitizeContainerName(name);
    } catch (error) {
      console.error('Error sanitizing container name:', error);
      reject(error);
      return;
    }

    const stopCommand = `docker stop ${sanitizedName}`;
    const removeCommand = `docker rm ${sanitizedName}`;

    exec(stopCommand, async (error, stdout, stderr) => {
      if (error) {
        console.error('Error stopping Docker container:', error);
        await _$gha_createIssueComment(
          github,
          context,
          `Error stopping Docker container: ${error.message}`,
        );
        reject(error);
      } else {
        console.log('Docker container stopped successfully:', stdout);
        await _$gha_createIssueComment(
          github,
          context,
          `Docker container stopped successfully: ${stdout}`,
        );

        exec(removeCommand, async (error, stdout, stderr) => {
          if (error) {
            console.error('Error removing Docker container:', error);
            await _$gha_createIssueComment(
              github,
              context,
              `Error removing Docker container: ${error.message}`,
            );
            reject(error);
          } else {
            console.log('Docker container removed successfully:', stdout);
            await _$gha_createIssueComment(
              github,
              context,
              `Docker container removed successfully: ${stdout}`,
            );
            resolve();
          }
        });
      }
    });
  });
}