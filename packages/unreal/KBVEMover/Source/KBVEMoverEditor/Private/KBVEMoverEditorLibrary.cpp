#include "KBVEMoverEditorLibrary.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/SkeletalMesh.h"
#include "PhysicsAssetUtils.h"
#include "PhysicsEngine/PhysicsAsset.h"
#include "PhysicsEngine/SkeletalBodySetup.h"
#include "UObject/Package.h"

UPhysicsAsset* UKBVEMoverEditorLibrary::CreatePhysicsAssetForMesh(USkeletalMesh* Mesh,
	const FString& PackagePath, const FString& AssetName)
{
	if (!Mesh)
	{
		return nullptr;
	}

	const FString FullPath = PackagePath / AssetName;
	UPackage* Package = CreatePackage(*FullPath);
	if (!Package)
	{
		return nullptr;
	}

	UPhysicsAsset* Asset = NewObject<UPhysicsAsset>(
		Package, FName(*AssetName), RF_Public | RF_Standalone | RF_Transactional);
	if (!Asset)
	{
		return nullptr;
	}

	// Not the factory's own entry point, which opens a settings dialog that a
	// commandlet can never answer -- the import pipeline runs headless.
	FPhysAssetCreateParams Params;

	// Hulls, because the question a support hand asks of a weapon is where its
	// surface is, and a capsule around a rifle's fore-end is a surface that is
	// not there. The default primitive suits a limb; a stock is not a limb.
	Params.GeomType = EFG_SingleConvexHull;
	Params.MaxHullVerts = 32;

	// The default skips any bone under 20 cm, which on a rifle is all of them:
	// the whole weapon is a metre long and its bones are the bolt, the trigger,
	// the magazine. Left at the default this produces an asset with no bodies
	// in it and reports success.
	Params.MinBoneSize = 0.5f;
	Params.bBodyForAll = true;
	Params.bWalkPastSmall = false;

	// Nothing here articulates. The bodies are geometry to query, not a ragdoll.
	Params.bCreateConstraints = false;
	Params.bDisableCollisionsByDefault = true;

	FText Error;
	const bool bMade = FPhysicsAssetUtils::CreateFromSkeletalMesh(
		Asset, Mesh, Params, Error, /*bSetToMesh*/ true, /*bShowProgress*/ false);

	if (!bMade)
	{
		UE_LOG(LogTemp, Error, TEXT("physics asset for %s failed: %s"),
			*Mesh->GetName(), *Error.ToString());
		return nullptr;
	}

	// Counted here because the body list is not exposed to script, and "the
	// call succeeded" is not the same claim as "the weapon has collision" --
	// the default parameters produce an empty asset and report success.
	int32 Hulls = 0;
	int32 Boxes = 0;
	int32 Spheres = 0;
	int32 Capsules = 0;
	for (const USkeletalBodySetup* Body : Asset->SkeletalBodySetups)
	{
		if (!Body)
		{
			continue;
		}
		Hulls += Body->AggGeom.ConvexElems.Num();
		Boxes += Body->AggGeom.BoxElems.Num();
		Spheres += Body->AggGeom.SphereElems.Num();
		Capsules += Body->AggGeom.SphylElems.Num();
		UE_LOG(LogTemp, Display, TEXT("  body %s: hull=%d box=%d sphere=%d capsule=%d"),
			*Body->BoneName.ToString(), Body->AggGeom.ConvexElems.Num(),
			Body->AggGeom.BoxElems.Num(), Body->AggGeom.SphereElems.Num(),
			Body->AggGeom.SphylElems.Num());
	}
	UE_LOG(LogTemp, Display,
		TEXT("physics asset %s: %d bodies, hull=%d box=%d sphere=%d capsule=%d"),
		*AssetName, Asset->SkeletalBodySetups.Num(), Hulls, Boxes, Spheres, Capsules);

	FAssetRegistryModule::AssetCreated(Asset);
	Asset->MarkPackageDirty();
	Mesh->MarkPackageDirty();
	return Asset;
}
