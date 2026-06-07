#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "UEDevOpsImportLibrary.generated.h"

UCLASS()
class UEDEVOPSEDITOR_API UUEDevOpsImportLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	UFUNCTION(BlueprintCallable, CallInEditor, Category = "UEDevOps|Import")
	static bool ImportRawAssetFolder(const FString& SourceFolder, const FString& DestContentPath, const FString& MaterialName);
};
