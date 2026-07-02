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

private:
	FVector ResolveWorldPos(const FSimgridInterpState& S) const;
	ASimgridEntityActor* SpawnActor(uint16 Kind);
	UKBVENpcSpriteRenderSubsystem* GetSpriteRenderer() const;
	void EnsureEnvDef();
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
	TObjectPtr<USkeletalMesh> MannyMesh;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> IdleAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> WalkAnim;

	UPROPERTY()
	TObjectPtr<UAnimationAsset> JogAnim;

	bool bAnimsLoaded = false;

	TMap<uint32, int32> SpriteHandleIds;
	TMap<uint16, FString> SlotNames;

	UPROPERTY()
	TWeakObjectPtr<AActor> LocalPawn;

	int32 LocalSlot = -1;
	bool bHasLocalPos = false;
	FVector LocalWorldPos = FVector::ZeroVector;

	bool bWarnedNoLocalPawn = false;
	bool bWarnedLocalNotDriver = false;
};
