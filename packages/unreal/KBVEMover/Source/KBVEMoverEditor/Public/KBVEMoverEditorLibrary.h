#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "KBVEMoverEditorLibrary.generated.h"

class USkeletalMesh;
class UPhysicsAsset;

/**
 * Editor-only helpers the asset pipeline needs and the engine does not expose.
 */
UCLASS()
class KBVEMOVEREDITOR_API UKBVEMoverEditorLibrary : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Build collision bodies for a skeletal mesh and assign them to it.
	 *
	 * Wraps UPhysicsAssetFactory, which is static editor-only C++ with no
	 * script flags, so the pipeline that imports these weapons cannot reach it
	 * from Python. Setting create_physics_asset on the import options only
	 * works on a mesh's first import and silently does nothing on a reimport,
	 * which is how two rifles ended up with no collision at all.
	 *
	 * The bodies are what a hand closes against, what a dropped weapon rests
	 * on, and what a hit tests against -- one asset, generated per weapon by
	 * the engine, rather than a cross-section measured by hand for one rifle.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static UPhysicsAsset* CreatePhysicsAssetForMesh(USkeletalMesh* Mesh, const FString& PackagePath,
		const FString& AssetName);
};
