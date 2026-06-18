/**
 * Canonical Forgejo wire types for the dashboard.
 *
 * Single source of truth: packages/data/proto/git/forgejo.proto →
 * codegen/generated/forgejo-schema.ts. This barrel re-exports the generated
 * types so the dashboard stops hand-maintaining its own copies. A few message
 * fields that Forgejo always returns are narrowed from optional to required
 * here, so existing call sites keep working without optional chaining.
 *
 * ForgejoCollaborator is intentionally NOT re-exported: Forgejo returns it as a
 * flattened user + permissions, which the proto models as a nested `user`
 * message — so the dashboard keeps its own flat definition in forgejoService.
 */
import type {
	ForgejoOwner,
	ForgejoRepo as GenForgejoRepo,
	ForgejoBranch as GenForgejoBranch,
	ForgejoBranchCommit,
	ForgejoCommit as GenForgejoCommit,
	ForgejoCommitDetail,
	ForgejoRelease as GenForgejoRelease,
	ForgejoReleaseAsset,
	ForgejoIssue as GenForgejoIssue,
	ForgejoTeam as GenForgejoTeam,
} from '@kbve/proto/forgejo-schema';

export type {
	ForgejoOwner,
	ForgejoUser,
	ForgejoOrg,
	ForgejoReleaseAsset,
	ForgejoBranchCommit,
	ForgejoCommitDetail,
	ForgejoInternalTracker,
	ForgejoSecret,
	ForgejoVariable,
	ForgejoHook,
	ForgejoBranchProtection,
	ForgejoStats,
	ForgejoStorage,
	ForgejoVersion,
	ForgejoCronTask,
	ForgejoLabel,
	ForgejoMilestone,
	ForgejoComment,
	ForgejoTag,
	ForgejoTagCommit,
	ForgejoPackage,
	ForgejoPublicKey,
	ForgejoGpgKey,
	ForgejoPull,
	ForgejoPullBranch,
	ForgejoPullMeta,
	ForgejoPermissions,
	ForgejoRegistrationToken,
} from '@kbve/proto/forgejo-schema';

// Forgejo always returns these nested objects for the records the dashboard
// loads; narrow them to required to match the previous hand-written interfaces.
export type ForgejoRepo = Omit<GenForgejoRepo, 'owner'> & {
	owner: ForgejoOwner;
};
export type ForgejoBranch = Omit<GenForgejoBranch, 'commit'> & {
	commit: ForgejoBranchCommit;
};
export type ForgejoCommit = Omit<GenForgejoCommit, 'commit'> & {
	commit: ForgejoCommitDetail;
};
export type ForgejoRelease = Omit<GenForgejoRelease, 'author' | 'assets'> & {
	author: ForgejoOwner;
	assets: ForgejoReleaseAsset[];
};
export type ForgejoIssue = Omit<GenForgejoIssue, 'user'> & {
	user: ForgejoOwner;
};
export type ForgejoTeam = Omit<GenForgejoTeam, 'units'> & {
	units: string[];
};
