#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "KBVEMeleeComponent.generated.h"

class UMeshComponent;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_ThreeParams(FKBVEOnMeleeHit, AActor*, HitActor, FVector, ImpactPoint, float, Damage);

UCLASS(ClassGroup = (KBVE), meta = (BlueprintSpawnableComponent), DisplayName = "KBVE Melee Component")
class KBVEGAMEPLAY_API UKBVEMeleeComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	UKBVEMeleeComponent();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void SetMeshComponent(UMeshComponent* InMesh);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void BeginSwing();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void EndSwing();

	UFUNCTION(BlueprintCallable, Category = "KBVE|Combat")
	void DoAttackTrace(FName SourceBone);

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float TraceDistance = 100.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float TraceRadius = 50.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float Damage = 10.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float KnockbackImpulse = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	float LaunchImpulse = 0.f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	bool bHitPawns = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	bool bHitWorldDynamic = true;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "KBVE|Combat")
	bool bSingleHitPerSwing = true;

	UPROPERTY(BlueprintAssignable, Category = "KBVE|Combat")
	FKBVEOnMeleeHit OnMeleeHit;

private:
	UMeshComponent* ResolveMesh() const;

	UPROPERTY()
	TWeakObjectPtr<UMeshComponent> MeshComp;

	TSet<TWeakObjectPtr<AActor>> HitThisSwing;
};
