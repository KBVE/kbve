#pragma once

#include "CoreMinimal.h"

THIRD_PARTY_INCLUDES_START
#include "git2.h"
THIRD_PARTY_INCLUDES_END

/**
 * Wraps libgit2 operations for cloning, fetching, and inspecting Git repos.
 * All operations are blocking — call from background threads or async tasks.
 */
class KBVELIBGIT_API FGitRepoService
{
public:
	/** Result of a Git operation */
	struct FGitResult
	{
		bool bSuccess = false;
		FString ErrorMessage;
		FString LocalPath;
	};

	/**
	 * Clone a public repo to a local path.
	 * @param RepoUrl     HTTPS URL of the public GitHub repo
	 * @param LocalPath   Destination folder on disk
	 * @param Branch      Optional branch/tag to checkout (empty = default branch)
	 */
	static FGitResult CloneRepo(const FString& RepoUrl, const FString& LocalPath, const FString& Branch = TEXT(""));

	/**
	 * Fetch latest refs from origin for an already-cloned repo.
	 * @param LocalPath   Path to the existing local repo
	 */
	static FGitResult FetchRepo(const FString& LocalPath);

	/**
	 * Checkout a specific ref (branch, tag, or commit SHA).
	 * @param LocalPath   Path to the existing local repo
	 * @param Ref         Branch name, tag, or full SHA
	 */
	static FGitResult CheckoutRef(const FString& LocalPath, const FString& Ref);

	/**
	 * Get the current HEAD ref name and short SHA.
	 * @param LocalPath   Path to the existing local repo
	 * @param OutRef      Receives the current ref name (e.g. "refs/heads/main")
	 * @param OutSha      Receives the abbreviated commit SHA
	 */
	static FGitResult GetRepoStatus(const FString& LocalPath, FString& OutRef, FString& OutSha);

private:
	/** Convert a libgit2 error code into an FGitResult */
	static FGitResult MakeError(int32 GitErrorCode);
};
