#pragma once

#include "CoreMinimal.h"
#include "UEDevOpsGitHubService.generated.h"

USTRUCT(BlueprintType)
struct FDevOpsGitHubIssue
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	int32 Number = 0;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString Title;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString State;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString HTMLURL;
};

USTRUCT(BlueprintType)
struct FDevOpsGitHubRelease
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString TagName;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString Name;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	bool bPrerelease = false;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString PublishedAt;

	UPROPERTY(BlueprintReadOnly, Category = "GitHub")
	FString HTMLURL;
};

DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnGitHubIssueCreated, bool, bSuccess, const FDevOpsGitHubIssue&, Issue);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnGitHubIssuesListed, bool, bSuccess, const TArray<FDevOpsGitHubIssue>&, Issues);
DECLARE_DYNAMIC_DELEGATE_TwoParams(FOnGitHubReleasesListed, bool, bSuccess, const TArray<FDevOpsGitHubRelease>&, Releases);

/**
 * Editor-only service for GitHub API integration.
 * Uses the token and repository from UEDevOpsSettings.
 */
UCLASS()
class UEDEVOPSEDITOR_API UUEDevOpsGitHubService : public UObject
{
	GENERATED_BODY()

public:
	/** Create a new issue on the configured GitHub repository. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|GitHub")
	static void CreateIssue(const FString& Title, const FString& Body,
		const TArray<FString>& Labels, const FOnGitHubIssueCreated& OnComplete);

	/** List open issues from the configured repository. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|GitHub")
	static void ListIssues(int32 MaxResults, const FOnGitHubIssuesListed& OnComplete);

	/** List releases from the configured repository. */
	UFUNCTION(BlueprintCallable, Category = "UEDevOps|GitHub")
	static void ListReleases(int32 MaxResults, const FOnGitHubReleasesListed& OnComplete);

	/** Open an editor dialog for creating a GitHub issue (editor toolbar action). */
	static void OpenCreateIssueDialog();

private:
	static bool GetGitHubConfig(FString& OutToken, FString& OutRepo);
	static FString BuildAPIURL(const FString& Repo, const FString& Endpoint);
};
