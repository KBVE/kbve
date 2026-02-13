import { promisify } from 'util';
import { exec } from 'child_process';
import type {
  GitHubClient,
  GitHubContext,
  CommitCategory,
  CleanedCommit,
} from './types';
import { _$gha_extractRepoContext } from './types';

const execAsync = promisify(exec);

export async function _$gha_getPullRequestNumber(
  github: GitHubClient,
  context: GitHubContext,
): Promise<number> {
  try {
    const { owner, repo } = _$gha_extractRepoContext(context);
    let branch: string;

    if (context.ref.startsWith('refs/pull/')) {
      branch = context.payload.pull_request!.head.ref;
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

    return pullRequests[0].number;
  } catch (error) {
    console.error('Error fetching pull request number:', error);
    throw error;
  }
}

export async function _$gha_updatePullRequestBody(
  github: GitHubClient,
  context: GitHubContext,
  prBody: string,
): Promise<void> {
  try {
    const { owner, repo } = _$gha_extractRepoContext(context);
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

export async function _$gha_fetchAndCleanCommits(
  branchToCompare: string,
): Promise<CleanedCommit> {
  await execAsync(`git fetch origin ${branchToCompare}`);
  const { stdout } = await execAsync(
    `git log --oneline origin/${branchToCompare}..HEAD`,
  );

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

  const commitCategory: CommitCategory = Object.keys(commitPatterns).reduce(
    (acc, key) => {
      acc[key as keyof CommitCategory] =
        cleanedCommits.match(
          commitPatterns[key as keyof Omit<CommitCategory, 'other'>],
        ) || [];
      return acc;
    },
    {} as CommitCategory,
  );

  commitCategory.other = cleanedCommits
    .split('\n')
    .filter(
      (commit) =>
        !Object.values(commitPatterns).some((pattern) =>
          pattern.test(commit),
        ),
    );

  return {
    branch: branchToCompare,
    categorizedCommits: commitCategory,
  };
}

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
  github: GitHubClient,
  context: GitHubContext,
): Promise<void> {
  try {
    const cleanedCommit = await _$gha_fetchAndCleanCommits(branchToCompare);
    const commitSummary = _$gha_formatCommits(cleanedCommit);
    await _$gha_updatePullRequestBody(github, context, commitSummary);
  } catch (error) {
    console.error('Error processing and updating PR:', error);
    throw error;
  }
}

export async function _$gha_createOrUpdatePR(
  github: GitHubClient,
  context: GitHubContext,
  targetBranch: string,
): Promise<void> {
  try {
    const { owner, repo } = _$gha_extractRepoContext(context);

    let referenceBranch: string | null = null;

    console.log(`GitHub Event Name: ${github.event_name}`);

    if (github.ref) {
      referenceBranch = github.ref.replace('refs/heads/', '');
      console.log(`Using github.ref: ${referenceBranch}`);
    } else if (
      context.payload &&
      context.payload.pull_request &&
      context.payload.pull_request.head
    ) {
      referenceBranch = context.payload.pull_request.head.ref;
      console.log(
        `Using context.payload.pull_request.head.ref: ${referenceBranch}`,
      );
    } else if (context.ref) {
      referenceBranch = context.ref.replace('refs/heads/', '');
      console.log(`Using context.ref: ${referenceBranch}`);
    } else {
      console.error('Unable to determine the reference branch.');
      throw new Error('Unable to determine the reference branch.');
    }

    if (!referenceBranch) {
      console.error('Reference branch is still null after checks.');
      throw new Error('Unable to determine the reference branch.');
    }

    const { data: pulls } = await github.rest.pulls.list({
      owner,
      repo,
      head: `${owner}:${referenceBranch}`,
      base: targetBranch,
      state: 'open',
    });

    if (pulls.length === 0) {
      await github.rest.pulls.create({
        title: `[CI] Merge ${referenceBranch} into ${targetBranch}`,
        owner,
        repo,
        head: referenceBranch,
        base: targetBranch,
        body: [
          'This PR is auto-generated by @kbve/devops',
          '[github actions](https://kbve.com/application/git/)',
        ].join('\n'),
      });
      console.log(
        `Pull request created from ${referenceBranch} to ${targetBranch}`,
      );
    } else {
      const existingPR = pulls[0];
      await github.rest.issues.createComment({
        owner,
        repo,
        issue_number: existingPR.number,
        body: `Updated by Job ${context.job}`,
      });
      console.log(
        `Pull request from ${referenceBranch} to ${targetBranch} already exists. Comment added.`,
      );
    }
  } catch (error) {
    console.error('Error creating or updating pull request:', error);
    throw error;
  }
}
