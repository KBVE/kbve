#pragma once

#include "CoreMinimal.h"
#include "SimgridInterpolator.h"
#include "UObject/Object.h"
#include "SimgridEntityManager.generated.h"

class USimgridClientSubsystem;
class USimgridWorldBridge;
class ASimgridEntityActor;
class UStaticMesh;

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

private:
	FVector ResolveWorldPos(const FSimgridInterpState& S) const;
	ASimgridEntityActor* SpawnActor(uint16 Kind);

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
	TWeakObjectPtr<AActor> LocalPawn;

	int32 LocalSlot = -1;
	bool bHasLocalPos = false;
	FVector LocalWorldPos = FVector::ZeroVector;

	bool bWarnedNoLocalPawn = false;
	bool bWarnedLocalNotDriver = false;
};
