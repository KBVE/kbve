#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "KBVEWorldGrassAtlas.generated.h"

class UMaterialInterface;
class UStaticMesh;

/**
 * One sheet of grass: the material it is sampled through, and the rectangles
 * worth cutting out of it.
 *
 * An asset rather than properties on the field because which cells a sheet has
 * is a property of the sheet, and two fields drawing the same pack should not
 * each carry their own copy of the answer. Built by the editor script from the
 * same JSON that imports the textures, so adding a pack stays a config entry.
 *
 * Cells cannot be found automatically, and that is not for want of trying: a
 * cutout pack lays its clumps out to fill the sheet, and packs that ship a model
 * spend most of theirs on UV islands for individual blades, which a component
 * pass happily returns as hundreds of unusable slivers. Someone has to say which
 * rectangles are a plant.
 */
UCLASS(BlueprintType)
class KBVEWORLD_API UKBVEWorldGrassAtlas : public UDataAsset
{
	GENERATED_BODY()

public:
	/** Masked card material over this sheet. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Grass")
	TObjectPtr<UMaterialInterface> Material;

	/**
	 * The pack's own clump models, when it ships them.
	 *
	 * Preferred over cutting cards out of the sheet wherever they exist, and
	 * for a reason that is not only that they look better: a model's UVs already
	 * say which part of the atlas is a plant, which is the question the cells
	 * below exist to answer by hand. Where a pack ships LODs, the model keeps
	 * them, so the distance chain is authored rather than invented.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Grass")
	TArray<TObjectPtr<UStaticMesh>> Clumps;

	/**
	 * UV rectangles, as (U0, V0, U1, V1) with V running down the sheet.
	 *
	 * The fallback for a sheet with no models behind it: crossed quads cut to
	 * these rectangles. Ignored entirely once Clumps has anything in it.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Grass")
	TArray<FVector4> Cells;

	/**
	 * How often this sheet is drawn from, against the others in a field.
	 *
	 * A pack of broad tufts and a pack of thin stems are not wanted in equal
	 * measure: the tufts cover ground and the stems break the silhouette, so the
	 * mixture is a choice rather than a division.
	 */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "KBVEWorld|Grass",
		meta = (ClampMin = "0"))
	int32 Weight = 1;
};
