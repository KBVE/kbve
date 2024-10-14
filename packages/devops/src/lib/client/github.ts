import {
  _title,
  sanitizePort,
  sanitizeContainerName,
  sanitizeContainerImage,
} from '../sanitization';
import { exec } from 'child_process';
import { CommitCategory, CleanedCommit } from '../../types';

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

//  [Helper Function https://kbve.com/journal/09-13/#2024]

export async function _$gha_getPullRequestNumber(
  github: any,
  context: any,
): Promise<number> {
  try {
    const { repo, owner } = context.repo;
    let branch: string;

    if (context.ref.startsWith('refs/pull/')) {
      branch = context.payload.pull_request.head.ref;
    } else {
      branch = context.ref.replace('refs/heads/', '');
    }

    const { data: pullRequests } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${branch}`,
      state: 'open',
    });

    if (pullRequests.length === 0) {
      throw new Error('No open pull requests found for this branch');
    }

    const prNumber = pullRequests[0].number;
    return prNumber;
  } catch (error) {
    console.error('Error fetching pull request number:', error);
    throw error;
  }
}

export async function _$gha_updatePullRequestBody(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  prBody: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;
    const prNumber = await _$gha_getPullRequestNumber(github, context);
    await github.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      body: prBody,
    });
    console.log(`PR #${prNumber} updated successfully`);
  } catch (err) {
    console.error('Error updating PR body:', err);
    throw err;
  }
}

//  [DEPRECATED] -> Removing this function and replacing it a new one.
export async function _$gha_fetchAndCategorizeCommits(
  branchToCompare: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(`git fetch origin ${branchToCompare}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching branch ${branchToCompare}:`, error);
        reject(error);
        return;
      }

      exec(
        `git log --oneline origin/${branchToCompare}..HEAD`,
        (error, stdout, stderr) => {
          if (error) {
            console.error('Error logging commits:', error);
            reject(error);
            return;
          }

          const rawCommits = stdout.trim();
          console.log('Raw commits (before cleaning):', rawCommits);

          const cleanedCommits = rawCommits.replace(
            /^[a-f0-9]{7} \([^)]*\) (.*)/gm,
            '$1',
          );

          console.log('Cleaned commits:', cleanedCommits);

          const ciCommits =
            cleanedCommits.match(/ci\([^)]+\):.*/gi)?.join('\n') || '';
          const fixCommits =
            cleanedCommits.match(/fix\([^)]+\):.*/gi)?.join('\n') || '';
          const docsCommits =
            cleanedCommits.match(/docs\([^)]+\):.*/gi)?.join('\n') || '';
          const featCommits =
            cleanedCommits.match(/feat\([^)]+\):.*/gi)?.join('\n') || '';
          const mergeCommits =
            cleanedCommits.match(/Merge pull request.*/gi)?.join('\n') || '';
          const otherCommits = cleanedCommits
            .split('\n')
            .filter(
              (commit) =>
                !/ci\(|fix\(|docs\(|feat\(|Merge pull request/.test(commit),
            )
            .join('\n');

          let commitSummary = `## PR Report for ${branchToCompare} with categorized commits: <br> <br>`;
          if (ciCommits)
            commitSummary += `### CI Changes: <br> ${ciCommits} <br> <br>`;
          if (fixCommits)
            commitSummary += `### Fixes: <br> ${fixCommits} <br> <br>`;
          if (docsCommits)
            commitSummary += `### Documentation: <br> ${docsCommits} <br> <br>`;
          if (featCommits)
            commitSummary += `### Features: <br> ${featCommits} <br> <br>`;
          if (mergeCommits)
            commitSummary += `### Merge Commits: <br> ${mergeCommits} <br> <br>`;
          if (otherCommits)
            commitSummary += `### Other Commits: <br> ${otherCommits} <br> <br>`;

          resolve(commitSummary);
        },
      );
    });
  });
}

export async function _$gha_fetchAndCleanCommits(
  branchToCompare: string,
): Promise<CleanedCommit> {
  return new Promise((resolve, reject) => {
    exec(`git fetch origin ${branchToCompare}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error fetching branch ${branchToCompare}:`, error);
        reject(error);
        return;
      }

      exec(
        `git log --oneline origin/${branchToCompare}..HEAD`,
        (error, stdout, stderr) => {
          if (error) {
            console.error('Error logging commits:', error);
            reject(error);
            return;
          }

          const rawCommits = stdout.trim();
          console.log('Raw commits (before cleaning):', rawCommits);

          const cleanedCommits = rawCommits.replace(
            /^[a-f0-9]{7} \([^)]*\) (.*)/gm,
            '$1',
          );

          const commitPatterns: {
            [key in keyof Omit<CommitCategory, 'other'>]: RegExp;
          } = {
            ci: /ci\([^)]+\):.*/gi,
            fix: /fix\([^)]+\):.*/gi,
            docs: /docs\([^)]+\):.*/gi,
            feat: /feat\([^)]+\):.*/gi,
            perf: /perf\([^)]+\):.*/gi,
            build: /build\([^)]+\):.*/gi,
            refactor: /refactor\([^)]+\):.*/gi,
            revert: /revert\([^)]+\):.*/gi,
            style: /style\([^)]+\):.*/gi,
            test: /test\([^)]+\):.*/gi,
            sync: /sync\([^)]+\):.*/gi,
            merge: /Merge pull request.*/gi,
          };

          const commitCategory: CommitCategory = Object.keys(
            commitPatterns,
          ).reduce((acc, key) => {
            acc[key as keyof CommitCategory] =
              cleanedCommits.match(
                commitPatterns[key as keyof Omit<CommitCategory, 'other'>],
              ) || [];
            return acc;
          }, {} as CommitCategory);

          commitCategory.other = cleanedCommits
            .split('\n')
            .filter(
              (commit) =>
                !Object.values(commitPatterns).some((pattern) =>
                  pattern.test(commit),
                ),
            );

          resolve({
            branch: branchToCompare,
            categorizedCommits: commitCategory,
          });
        },
      );
    });
  });
}

//  Alpha Helper Function - Reference https://kbve.com/journal/09-15/#2024
export function _$gha_formatCommits(cleanedCommit: CleanedCommit): string {
  const { branch, categorizedCommits } = cleanedCommit;

  const logo_markdown = `[![KBVE Logo](https://kbve.com/assets/img/letter_logo.png)](https://kbve.com)\
  <br>\
  ---\
  <br>\
  `;
  const footer_markdown = `For more details, visit [the docs](https://kbve.com/welcome-to-docs/).\
  <br>\
  ---\
  <br>\
  `;

  let commitSummary = `${logo_markdown}\
  <br>\
  ## PR Report for ${branch} with categorized commits:\
  <br>\
  ---\
  <br>\
  `;

  const commitTitles: { [key in keyof CommitCategory]: string } = {
    ci: 'CI Changes',
    fix: 'Fixes',
    docs: 'Documentation',
    feat: 'Features',
    perf: 'Performance',
    build: 'Build',
    refactor: 'Refactor',
    revert: 'Reverts',
    style: 'Style Changes',
    test: 'Tests',
    sync: 'Syncs',
    merge: 'Merge Commits',
    other: 'Other Commits',
  };

  Object.keys(categorizedCommits).forEach((key) => {
    const commitType = key as keyof CommitCategory;
    const commits = categorizedCommits[commitType];
    if (commits.length) {
      commitSummary += `### ${commitTitles[commitType]}:<br>${commits.join('<br>')}<br>`;
    }
  });

  commitSummary += footer_markdown;

  return commitSummary;
}

export async function _$gha_processAndUpdatePR(
  branchToCompare: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
): Promise<void> {
  try {
    //const commitSummary = await _$gha_fetchAndCategorizeCommits(branchToCompare);
    const cleanedCommit = await _$gha_fetchAndCleanCommits(branchToCompare);
    const commitSummary = _$gha_formatCommits(cleanedCommit);
    await _$gha_updatePullRequestBody(github, context, commitSummary);
  } catch (error) {
    console.error('Error processing and updating PR:', error);
    throw error;
  }
}

//  [Github Docker Commands - https://kbve.com/journal/07-26/#2024]

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

export async function _$gha_createOrUpdatePR(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  github: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any,
  referenceBranch: string,
  targetBranch: string,
): Promise<void> {
  try {
    const { repo, owner } = context.repo;

    // Check if there's an open PR from referenceBranch to targetBranch
    const { data: pulls } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${referenceBranch}`,
      base: targetBranch,
      state: 'open',
    });

    if (pulls.length === 0) {
      // If no existing PR, create a new one
      await github.rest.pulls.create({
        title: `[CI] Merge ${referenceBranch} into ${targetBranch}`,
        owner,
        repo,
        head: referenceBranch,
        base: targetBranch,
        body: [
          'This PR is auto-generated by the GitHub Action',
          '[actions/github-script](https://github.com/actions/github-script)',
        ].join('\n'),
      });
      console.log(`Pull request created from ${referenceBranch} to ${targetBranch}`);
    } else {
      // If a PR exists, either update its body or add a comment
      const existingPR = pulls[0];
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: existingPR.number,
        body: `Updated by Job ${context.job}`,
      });
      console.log(`Pull request from ${referenceBranch} to ${targetBranch} already exists. Comment added.`);
    }
  } catch (error) {
    console.error('Error creating or updating pull request:', error);
    throw error;
  }
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
