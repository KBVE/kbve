#pragma once

#include "CoreMinimal.h"
#include "Subsystems/WorldSubsystem.h"
#include "KBVENpcSpriteRenderSubsystem.generated.h"

class UKBVENpcSpriteDef;
class UInstancedStaticMeshComponent;
class UMaterialInstanceDynamic;
class UMaterialInterface;
class UStaticMesh;

USTRUCT(BlueprintType)
struct FKBVENpcSpriteHandle
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "KBVE|NPC|Sprite")
	int32 Id = INDEX_NONE;

	bool IsValid() const { return Id != INDEX_NONE; }
};

UCLASS()
class KBVENPCSPRITE_API UKBVENpcSpriteRenderSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual bool ShouldCreateSubsystem(UObject* Outer) const override;
	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override { RETURN_QUICK_DECLARE_CYCLE_STAT(UKBVENpcSpriteRenderSubsystem, STATGROUP_Tickables); }

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC|Sprite")
	FKBVENpcSpriteHandle SpawnSprite(UKBVENpcSpriteDef* Def, FVector Location, float FacingYawDeg = 0.0f);

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC|Sprite")
	void UpdateSprite(FKBVENpcSpriteHandle Handle, FVector Location, float FacingYawDeg);

	UFUNCTION(BlueprintCallable, Category = "KBVE|NPC|Sprite")
	void DespawnSprite(FKBVENpcSpriteHandle Handle);

	bool DebugStoredYawDeg(FKBVENpcSpriteHandle Handle, float& OutYawDeg) const;

	void DebugSetCellParams(UKBVENpcSpriteDef* Def, float RowFront, float RowSide, float RowBack, float SwapSide);

private:
	struct FInstanceRec
	{
		TObjectPtr<UKBVENpcSpriteDef> Def = nullptr;
		FVector Location = FVector::ZeroVector;
		float FacingYaw = 0.0f;
		FVector AppliedLocation = FVector(FLT_MAX);
		float AppliedYaw = FLT_MAX;
		TObjectPtr<UInstancedStaticMeshComponent> HISM = nullptr;
		int32 Index = INDEX_NONE;
	};

	void EnsureHost();
	UStaticMesh* GetPlaneMesh();
	UMaterialInterface* GetOrCreateBillboardMaterial();
	UInstancedStaticMeshComponent* GetOrCreateHISM(UKBVENpcSpriteDef* Def);

	UPROPERTY(Transient)
	TObjectPtr<AActor> HostActor = nullptr;

	UPROPERTY(Transient)
	TObjectPtr<UStaticMesh> PlaneMesh = nullptr;

	UPROPERTY(Transient)
	TMap<TObjectPtr<UKBVENpcSpriteDef>, TObjectPtr<UInstancedStaticMeshComponent>> DefHISMs;

	UPROPERTY(Transient)
	TMap<TObjectPtr<UKBVENpcSpriteDef>, TObjectPtr<UMaterialInstanceDynamic>> DefMIDs;

	TMap<int32, FInstanceRec> Instances;
	TMap<UInstancedStaticMeshComponent*, TArray<int32>> IndexToHandle;
	int32 NextHandle = 1;
};
