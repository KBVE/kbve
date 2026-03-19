#include "GitPluginValidator.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformFileManager.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

FGitPluginValidator::FValidationResult FGitPluginValidator::Validate(const FString& RepoLocalPath)
{
	FValidationResult Result;

	// Find .uplugin file
	TArray<FString> FoundFiles;
	IFileManager::Get().FindFilesRecursive(FoundFiles, *RepoLocalPath, TEXT("*.uplugin"), true, false, false);

	if (FoundFiles.Num() == 0)
	{
		Result.ErrorMessage = TEXT("No .uplugin file found in repository");
		return Result;
	}

	if (FoundFiles.Num() > 1)
	{
		Result.Warnings.Add(FString::Printf(TEXT("Multiple .uplugin files found (%d), using first: %s"), FoundFiles.Num(), *FoundFiles[0]));
	}

	Result.UpluginPath = FoundFiles[0];

	// Parse the .uplugin JSON
	FString JsonContent;
	if (!FFileHelper::LoadFileToString(JsonContent, *Result.UpluginPath))
	{
		Result.ErrorMessage = FString::Printf(TEXT("Failed to read %s"), *Result.UpluginPath);
		return Result;
	}

	TSharedPtr<FJsonObject> JsonObj;
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(JsonContent);
	if (!FJsonSerializer::Deserialize(Reader, JsonObj) || !JsonObj.IsValid())
	{
		Result.ErrorMessage = TEXT(".uplugin file contains invalid JSON");
		return Result;
	}

	// Extract plugin name from filename
	Result.PluginName = FPaths::GetBaseFilename(Result.UpluginPath);

	// Read version
	JsonObj->TryGetStringField(TEXT("VersionName"), Result.VersionName);

	// Check for Modules array
	const TArray<TSharedPtr<FJsonValue>>* Modules;
	if (!JsonObj->TryGetArrayField(TEXT("Modules"), Modules) || Modules->Num() == 0)
	{
		Result.Warnings.Add(TEXT("No Modules defined — plugin may be content-only"));
	}

	// Check FileVersion
	int32 FileVersion = 0;
	if (JsonObj->TryGetNumberField(TEXT("FileVersion"), FileVersion) && FileVersion < 3)
	{
		Result.Warnings.Add(FString::Printf(TEXT("Old FileVersion %d — may need updating"), FileVersion));
	}

	Result.bIsValid = true;

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Validated plugin: %s v%s (%s)"), *Result.PluginName, *Result.VersionName, *Result.UpluginPath);
	return Result;
}

bool FGitPluginValidator::InstallToProject(const FString& RepoLocalPath, const FString& PluginName)
{
	FString ProjectDir = FPaths::ProjectDir();
	FString DestDir = FPaths::Combine(ProjectDir, TEXT("Plugins"), PluginName);

	if (IFileManager::Get().DirectoryExists(*DestDir))
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVELibGit] Plugin directory already exists: %s"), *DestDir);
		return false;
	}

	// Determine source dir: use the directory containing the .uplugin, not necessarily repo root
	FValidationResult Validation = Validate(RepoLocalPath);
	if (!Validation.bIsValid)
	{
		UE_LOG(LogTemp, Error, TEXT("[KBVELibGit] Cannot install invalid plugin: %s"), *Validation.ErrorMessage);
		return false;
	}

	FString SourceDir = FPaths::GetPath(Validation.UpluginPath);

	// Copy tree
	if (!FPlatformFileManager::Get().GetPlatformFile().CopyDirectoryTree(*DestDir, *SourceDir, true))
	{
		UE_LOG(LogTemp, Error, TEXT("[KBVELibGit] Failed to copy %s -> %s"), *SourceDir, *DestDir);
		return false;
	}

	UE_LOG(LogTemp, Log, TEXT("[KBVELibGit] Installed plugin %s -> %s"), *PluginName, *DestDir);
	return true;
}
