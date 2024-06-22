import { _title } from '../sanitization';

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
  context: any
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