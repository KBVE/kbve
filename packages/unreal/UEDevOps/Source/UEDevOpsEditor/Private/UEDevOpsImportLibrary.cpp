#include "UEDevOpsImportLibrary.h"

#include "Engine/Engine.h"
#include "HAL/FileManager.h"
#include "Interfaces/IPluginManager.h"
#include "Misc/Paths.h"

bool UUEDevOpsImportLibrary::ImportRawAssetFolder(const FString& SourceFolder, const FString& DestContentPath, const FString& MaterialName)
{
	if (!GEngine)
	{
		return false;
	}

	TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("UEDevOps"));
	if (!Plugin.IsValid())
	{
		UE_LOG(LogTemp, Error, TEXT("[UEDevOps] Plugin not found"));
		return false;
	}

	const FString ScriptPath = FPaths::ConvertRelativePathToFull(Plugin->GetContentDir() / TEXT("Python/import_raw_folder.py"));
	if (!FPaths::FileExists(ScriptPath))
	{
		UE_LOG(LogTemp, Error, TEXT("[UEDevOps] Python script missing: %s"), *ScriptPath);
		return false;
	}

	const FString AbsoluteSource = FPaths::ConvertRelativePathToFull(SourceFolder);

	FString Command = FString::Printf(TEXT("py \"%s\" --source \"%s\" --dest \"%s\""),
		*ScriptPath, *AbsoluteSource, *DestContentPath);
	if (!MaterialName.IsEmpty())
	{
		Command += FString::Printf(TEXT(" --material-name \"%s\""), *MaterialName);
	}

	UE_LOG(LogTemp, Display, TEXT("[UEDevOps] %s"), *Command);
	return GEngine->Exec(nullptr, *Command);
}
