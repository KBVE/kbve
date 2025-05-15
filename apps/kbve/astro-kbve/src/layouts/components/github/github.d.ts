export interface GithubContributor {
	login: string;
	id: number;
	avatar_url: string;
	contributions: number;
}

export interface GithubAvatar {
	src: string;
	login: string;
}

export interface GitHubUser {
	login: string;
	id: number;
	node_id: string;
	avatar_url: string;
	gravatar_id: string;
	url: string;
	html_url: string;
	followers_url: string;
	following_url: string;
	gists_url: string;
	starred_url: string;
	subscriptions_url: string;
	organizations_url: string;
	repos_url: string;
	events_url: string;
	received_events_url: string;
	type: string;
	site_admin: boolean;
}

export interface GitHubCommitAuthor {
	name: string;
	email: string;
	date: string;
}

export interface GitHubCommitDetail {
	author: GitHubCommitAuthor;
	committer: GitHubCommitAuthor;
	message: string;
	tree: {
		sha: string;
		url: string;
	};
	url: string;
	comment_count: number;
	verification: {
		verified: boolean;
		reason: string;
		signature: string;
		payload: string;
	};
}

export interface GitHubCommit {
	sha: string;
	node_id: string;
	commit: GitHubCommitDetail;
	url: string;
	html_url: string;
	comments_url: string;
	author: GitHubUser | null;
	committer: GitHubUser | null;
	parents: Array<{
		sha: string;
		url: string;
		html_url: string;
	}>;
}