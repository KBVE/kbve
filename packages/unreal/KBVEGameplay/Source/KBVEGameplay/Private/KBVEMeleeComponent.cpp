#include "KBVEMeleeComponent.h"

#include "KBVECombatInterfaces.h"
#include "Components/MeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

UKBVEMeleeComponent::UKBVEMeleeComponent()
{
	PrimaryComponentTick.bCanEverTick = false;
}

void UKBVEMeleeComponent::SetMeshComponent(UMeshComponent* InMesh)
{
	MeshComp = InMesh;
}

UMeshComponent* UKBVEMeleeComponent::ResolveMesh() const
{
	if (MeshComp.IsValid())
	{
		return MeshComp.Get();
	}
	const AActor* Owner = GetOwner();
	return Owner ? Owner->FindComponentByClass<UMeshComponent>() : nullptr;
}

void UKBVEMeleeComponent::BeginSwing()
{
	HitThisSwing.Reset();
}

void UKBVEMeleeComponent::EndSwing()
{
	HitThisSwing.Reset();
}

void UKBVEMeleeComponent::DoAttackTrace(FName SourceBone)
{
	AActor* Owner = GetOwner();
	UMeshComponent* Mesh = ResolveMesh();
	UWorld* World = GetWorld();
	if (!Owner || !Mesh || !World)
	{
		return;
	}

	if (!bHitPawns && !bHitWorldDynamic)
	{
		return;
	}

	const FVector TraceStart = Mesh->GetSocketLocation(SourceBone);
	const FVector TraceEnd   = TraceStart + (Owner->GetActorForwardVector() * TraceDistance);

	FCollisionObjectQueryParams ObjectParams;
	if (bHitPawns)        ObjectParams.AddObjectTypesToQuery(ECC_Pawn);
	if (bHitWorldDynamic) ObjectParams.AddObjectTypesToQuery(ECC_WorldDynamic);

	FCollisionShape Shape;
	Shape.SetSphere(TraceRadius);

	FCollisionQueryParams QueryParams;
	QueryParams.AddIgnoredActor(Owner);

	TArray<FHitResult> OutHits;
	if (!World->SweepMultiByObjectType(OutHits, TraceStart, TraceEnd, FQuat::Identity, ObjectParams, Shape, QueryParams))
	{
		return;
	}

	for (const FHitResult& Hit : OutHits)
	{
		AActor* HitActor = Hit.GetActor();
		IKBVECombatDamageable* Damageable = Cast<IKBVECombatDamageable>(HitActor);
		if (!Damageable)
		{
			continue;
		}
		if (bSingleHitPerSwing && HitThisSwing.Contains(HitActor))
		{
			continue;
		}
		HitThisSwing.Add(HitActor);

		const FVector Impulse = (Hit.ImpactNormal * -KnockbackImpulse) + (FVector::UpVector * LaunchImpulse);
		Damageable->ApplyDamage(Damage, Owner, Hit.ImpactPoint, Impulse);
		OnMeleeHit.Broadcast(HitActor, Hit.ImpactPoint, Damage);
	}
}
