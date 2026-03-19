#pragma once

#include "CoreMinimal.h"

/**
 * Validates that a cloned repo looks like a valid Unreal plugin
 * before we move it into the project's Plugins/ directory.
 */
class KBVELIBGIT_API FGitPluginValidator
{
public:
	struct FValidationResult
	{
		bool bIsValid = false;
		FString PluginName;
		FString VersionName;
		FString UpluginPath;
		TArray<FString> Warnings;
		FString ErrorMessage;
	};

	/**
	 * Scan a directory for a .uplugin file and validate its contents.
	 * @param RepoLocalPath   Root of the cloned repo on disk
	 */
	static FValidationResult Validate(const FString& RepoLocalPath);

	/**
	 * Move a validated plugin into the project's Plugins/ directory.
	 * @param RepoLocalPath   Root of the cloned repo (staging area)
	 * @param PluginName      Name to use for the target folder
	 * @return                True if the move succeeded
	 */
	static bool InstallToProject(const FString& RepoLocalPath, const FString& PluginName);
};
