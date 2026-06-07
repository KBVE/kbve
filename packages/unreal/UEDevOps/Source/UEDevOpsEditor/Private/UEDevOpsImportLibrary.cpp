#include "UEDevOpsImportLibrary.h"

#include "DesktopPlatformModule.h"
#include "Engine/Engine.h"
#include "Framework/Application/SlateApplication.h"
#include "HAL/FileManager.h"
#include "IDesktopPlatform.h"
#include "Interfaces/IPluginManager.h"
#include "Misc/MessageDialog.h"
#include "Misc/Paths.h"

#define LOCTEXT_NAMESPACE "UEDevOpsImport"

bool FUEDevOpsImportLibrary::ImportRawAssetFolder(const FString& SourceFolder, const FString& DestContentPath, const FString& MaterialName)
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

void FUEDevOpsImportLibrary::PromptAndImport()
{
	IDesktopPlatform* Desktop = FDesktopPlatformModule::Get();
	if (!Desktop)
	{
		return;
	}

	const void* ParentWindow = FSlateApplication::Get().FindBestParentWindowHandleForDialogs(nullptr);

	FString SourceFolder;
	if (!Desktop->OpenDirectoryDialog(
			ParentWindow,
			TEXT("Pick a Raw asset folder (FBX + textures)"),
			FPaths::ProjectDir() / TEXT("Raw"),
			SourceFolder))
	{
		return;
	}

	FString DestContentPath = TEXT("/Game/Imported/") + FPaths::GetCleanFilename(SourceFolder);
	FString MaterialName    = FPaths::GetCleanFilename(SourceFolder);

	UE_LOG(LogTemp, Display, TEXT("[UEDevOps] Source=%s Dest=%s Material=%s"), *SourceFolder, *DestContentPath, *MaterialName);

	if (!ImportRawAssetFolder(SourceFolder, DestContentPath, MaterialName))
	{
		FMessageDialog::Open(EAppMsgType::Ok,
			LOCTEXT("ImportFailed", "Import failed. Check the Output Log — the Python plugin must be enabled."));
	}
}

#undef LOCTEXT_NAMESPACE
