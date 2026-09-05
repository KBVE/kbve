#pragma once

#include "CoreMinimal.h"
#include "KBVEWeaponGrip.h"
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

	/**
	 * Slice a weapon along its own length and report the underside of each slice.
	 *
	 * The one thing that made a grip per-weapon work was a person measuring the
	 * fore-end, and a person is exactly what a second weapon does not get: the
	 * SS2's numbers were an estimate, admitted as one, and the solver believed
	 * them. The mesh already states its own shape, so it is asked.
	 *
	 * The underside rather than the bounds. A slice through a rifle contains the
	 * scope, the sling swivel and the magazine as readily as the handguard, and
	 * a bounding box round all of it describes nothing a hand can hold. Sorting
	 * the slice by height and taking the lowest connected run of it gives the
	 * part a support hand actually arrives at, and drops everything mounted
	 * above the barrel without needing to know what any of it is.
	 *
	 * Vertices off the imported model, not the render buffers: this runs in the
	 * import commandlet where the source model is loaded anyway, and the render
	 * data would have to be built to be read.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static TArray<FKBVEGripSlab> MeasureWeaponProfile(USkeletalMesh* Mesh, float SlabWidth = 1.0f,
		float ClusterGap = 1.5f);

	/**
	 * Write every vertex of a weapon out as JSON, sliced by station.
	 *
	 * The measuring above is a rule applied to a point cloud, and a rule applied
	 * to a point cloud that nobody has looked at is a guess with a compile step.
	 * The first one produced a Mosin fore-end a centimetre tall; it was wrong in
	 * a way no amount of reasoning about it would have settled, because the
	 * question was what the vertices actually do between the wood and the
	 * barrel. This answers that, once, outside the engine.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static bool DumpWeaponSlices(USkeletalMesh* Mesh, const FString& Path, float SlabWidth = 1.0f);

	/**
	 * Each named bone's rest offset from its parent, as text.
	 *
	 * The grip frame is built out of these -- which way the fingers point, which
	 * way they spread -- and every time one of them has been assumed rather than
	 * read, the hand has come out turned a quarter turn. Reading them costs one
	 * line and settles it.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static TArray<FString> DumpBoneRestOffsets(USkeletalMesh* Mesh, const TArray<FName>& Bones);

	/**
	 * Where each finger's tip sits in the hand's own space, at rest.
	 *
	 * Manny's finger roots are all in the same place -- under half a centimetre
	 * apart -- so the hand's spread axis is not in their offsets at all, it is
	 * in their rotations. Subtracting one root from another to get a spread
	 * therefore measures nothing, and a grip frame built on it is a quarter turn
	 * out. This composes each chain to its tip so the spread is a thing that can
	 * be read rather than assumed.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static TArray<FString> DumpFingerTips(USkeletalMesh* Mesh, FName HandBone);

	/**
	 * Where named bones sit in the mesh's own space, at rest.
	 *
	 * The offsets above are relative to a parent, which is the wrong frame for
	 * asking a question like "where is the trigger": a rifle's trigger bone
	 * hangs a couple of millimetres off its parent and the number that matters
	 * is where that lands on the weapon.
	 */
	UFUNCTION(BlueprintCallable, Category = "KBVE|Editor")
	static TArray<FString> DumpBonePositions(USkeletalMesh* Mesh, const TArray<FName>& Bones);
};
