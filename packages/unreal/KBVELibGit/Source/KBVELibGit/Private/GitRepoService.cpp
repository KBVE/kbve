#include "GitRepoService.h"

FGitRepoService::FGitResult FGitRepoService::MakeError(int32 GitErrorCode)
{
	FGitResult Result;
	Result.bSuccess = false;
	const git_error* Err = git_error_last();
	if (Err)
	{
		Result.ErrorMessage = FString::Printf(TEXT("libgit2 error %d: %hs"), GitErrorCode, Err->message);
	}
	else
	{
		Result.ErrorMessage = FString::Printf(TEXT("libgit2 error %d (no detail)"), GitErrorCode);
	}
	UE_LOG(LogTemp, Error, TEXT("[KBVELibGit] %s"), *Result.ErrorMessage);
	return Result;
}

FGitRepoService::FGitResult FGitRepoService::CloneRepo(const FString& RepoUrl, const FString& LocalPath, const FString& Branch)
{
	FGitResult Result;

	git_clone_options CloneOpts = GIT_CLONE_OPTIONS_INIT;

	if (!Branch.IsEmpty())
	{
		CloneOpts.checkout_branch = TCHAR_TO_UTF8(*Branch);
	}

	git_repository* Repo = nullptr;
	int32 Err = git_clone(&Repo, TCHAR_TO_UTF8(*RepoUrl), TCHAR_TO_UTF8(*LocalPath), &CloneOpts);

	if (Err != 0)
	{
		return MakeError(Err);
	}

	Result.bSuccess = true;
	Result.LocalPath = LocalPath;
	git_repository_free(Repo);

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Cloned %s -> %s"), *RepoUrl, *LocalPath);
	return Result;
}

FGitRepoService::FGitResult FGitRepoService::FetchRepo(const FString& LocalPath)
{
	FGitResult Result;

	git_repository* Repo = nullptr;
	int32 Err = git_repository_open(&Repo, TCHAR_TO_UTF8(*LocalPath));
	if (Err != 0)
	{
		return MakeError(Err);
	}

	git_remote* Remote = nullptr;
	Err = git_remote_lookup(&Remote, Repo, "origin");
	if (Err != 0)
	{
		git_repository_free(Repo);
		return MakeError(Err);
	}

	git_fetch_options FetchOpts = GIT_FETCH_OPTIONS_INIT;
	Err = git_remote_fetch(Remote, nullptr, &FetchOpts, nullptr);

	if (Err != 0)
	{
		git_remote_free(Remote);
		git_repository_free(Repo);
		return MakeError(Err);
	}

	Result.bSuccess = true;
	Result.LocalPath = LocalPath;

	git_remote_free(Remote);
	git_repository_free(Repo);

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Fetched origin for %s"), *LocalPath);
	return Result;
}

FGitRepoService::FGitResult FGitRepoService::CheckoutRef(const FString& LocalPath, const FString& Ref)
{
	FGitResult Result;

	git_repository* Repo = nullptr;
	int32 Err = git_repository_open(&Repo, TCHAR_TO_UTF8(*LocalPath));
	if (Err != 0)
	{
		return MakeError(Err);
	}

	// Resolve the ref to an object
	git_object* Target = nullptr;
	Err = git_revparse_single(&Target, Repo, TCHAR_TO_UTF8(*Ref));
	if (Err != 0)
	{
		git_repository_free(Repo);
		return MakeError(Err);
	}

	// Checkout the tree
	git_checkout_options CheckoutOpts = GIT_CHECKOUT_OPTIONS_INIT;
	CheckoutOpts.checkout_strategy = GIT_CHECKOUT_SAFE;

	Err = git_checkout_tree(Repo, Target, &CheckoutOpts);
	if (Err != 0)
	{
		git_object_free(Target);
		git_repository_free(Repo);
		return MakeError(Err);
	}

	// Detach HEAD to the resolved commit
	const git_oid* Oid = git_object_id(Target);
	Err = git_repository_set_head_detached(Repo, Oid);

	git_object_free(Target);
	git_repository_free(Repo);

	if (Err != 0)
	{
		return MakeError(Err);
	}

	Result.bSuccess = true;
	Result.LocalPath = LocalPath;

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Checked out %s in %s"), *Ref, *LocalPath);
	return Result;
}

FGitRepoService::FGitResult FGitRepoService::GetRepoStatus(const FString& LocalPath, FString& OutRef, FString& OutSha)
{
	FGitResult Result;

	git_repository* Repo = nullptr;
	int32 Err = git_repository_open(&Repo, TCHAR_TO_UTF8(*LocalPath));
	if (Err != 0)
	{
		return MakeError(Err);
	}

	git_reference* HeadRef = nullptr;
	Err = git_repository_head(&HeadRef, Repo);
	if (Err != 0)
	{
		git_repository_free(Repo);
		return MakeError(Err);
	}

	OutRef = UTF8_TO_TCHAR(git_reference_name(HeadRef));

	const git_oid* Oid = git_reference_target(HeadRef);
	if (Oid)
	{
		char ShaBuf[GIT_OID_SHA1_HEXSIZE + 1];
		git_oid_tostr(ShaBuf, sizeof(ShaBuf), Oid);
		OutSha = UTF8_TO_TCHAR(ShaBuf);
		// Abbreviate to 8 chars
		OutSha = OutSha.Left(8);
	}

	git_reference_free(HeadRef);
	git_repository_free(Repo);

	Result.bSuccess = true;
	Result.LocalPath = LocalPath;
	return Result;
}
