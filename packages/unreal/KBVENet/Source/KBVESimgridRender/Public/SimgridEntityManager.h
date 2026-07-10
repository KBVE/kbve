#pragma once

#include "CoreMinimal.h"
#include "SimgridInterpolator.h"
#include "UObject/Object.h"
#include "SimgridEntityManager.generated.h"

class USimgridClientSubsystem;
class USimgridWorldBridge;
class ASimgridEntityActor;
class UStaticMesh;
class USkeletalMesh;
class UKBVENpcSpriteRenderSubsystem;
class UKBVENpcSpriteDef;
class UAnimationAsset;

struct FSimgridLocalPools
{
	int32 Hp = 0;
	int32 MaxHp = 0;
	int32 Mp = 0;
	int32 MaxMp = 0;
	int32 Energy = 0;
	int32 MaxEnergy = 0;
	int32 Stamina = 0;
	int32 MaxStamina = 0;
};

UCLASS()
class KBVESIMGRIDRENDER_API USimgridEntityManager : public UObject
{
	GENERATED_BODY()

public:
	void Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh);
	void SetLocalSlot(int32 Slot) { LocalSlot = Slot; }
	void SetLocalPawn(AActor* Pawn) { LocalPawn = Pawn; }
	virtual void BeginDestroy() override;

	UFUNCTION()
	void OnSnapshotReceived();

	void Tick(double NowMs);
	void Clear();

	bool IsLocalWorldPos(FVector& OutPos) const;
	bool WorldPosOf(uint32 Eid, FVector& OutPos) const;
	FString NameForSlot(uint16 Slot) const;
	bool GetLocalPools(FSimgridLocalPools& OutPools) const
	{
		OutPools = LocalPools;
		return LocalPools.MaxHp > 0;
	}

private:
	FVector ResolveWorldPos(const FSimgridInterpState& S) const;
	ASimgridEntityActor* SpawnActor(uint16 Kind);
	UKBVENpcSpriteRenderSubsystem* GetSpriteRenderer() const;
	void EnsureEnvDef();
	UKBVENpcSpriteDef* EnsureTreeDef();
	USkeletalMesh* EnsureMannyMesh();
	void EnsureLocomotionAnims();
	UAnimationAsset* PickLocomotionAnim(float Speed);

	FSimgridInterpolator Interp;

	UPROPERTY()
	TWeakObjectPtr<UWorld> WorldPtr;

	UPROPERTY()
	TObjectPtr<USimgridClientSubsystem> Sub;

	UPROPERTY()
	TObjectPtr<USimgridWorldBridge> WorldBridge;

	UPROPERTY()
	TObjectPtr<UStaticMesh> DefaultMeshAsset;

	UPROPERTY()
	TMap<uint32, TObjectPtr<ASimgridEntityActor>> Actors;

	UPROPERTY()
	TObjectPtr<UKBVENpcSpriteDef> EnvDef;

	UPROPERTY()
	TObjectPtr<UKBVENpcSpriteDef> TreeDef;

	bool bTreeAtlasWarned = false;

	UPROPERTY()
	TObjectPtr<USkeletalMesh> MannyMesh;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> IdleAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> WalkAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> JogAnim;

	bool bAnimsLoaded = false;

	TMap<uint32, int32> SpriteHandleIds;
	TMap<uint32, uint8> EnvSubApplied;
	TMap<uint16, FString> SlotNames;

	UPROPERTY()
	TWeakObjectPtr<AActor> LocalPawn;

	int32 LocalSlot = -1;
	FSimgridLocalPools LocalPools;
	bool bHasLocalPos = false;
	FVector LocalWorldPos = FVector::ZeroVector;

	bool bWarnedNoLocalPawn = false;
	bool bWarnedLocalNotDriver = false;
};
