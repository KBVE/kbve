#pragma once

#include "CoreMinimal.h"

class UEDEVOPSEDITOR_API FUEDevOpsImportLibrary
{
public:
	static bool ImportRawAssetFolder(const FString& SourceFolder, const FString& DestContentPath, const FString& MaterialName);

	static void PromptAndImport();
};
