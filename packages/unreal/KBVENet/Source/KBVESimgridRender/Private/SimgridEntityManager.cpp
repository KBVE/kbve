#include "SimgridEntityManager.h"
#include "SimgridEntityActor.h"
#include "SimgridWorldBridge.h"
#include "SimgridReconcile.h"
#include "SimgridClientSubsystem.h"
#include "SimgridCoords.h"
#include "KBVEMovementDriver.h"
#include "KBVESimgridRenderModule.h"
#include "Engine/World.h"

void USimgridEntityManager::Setup(UWorld* World, USimgridClientSubsystem* Subsystem, USimgridWorldBridge* Bridge, UStaticMesh* DefaultMesh)
{
	WorldPtr = World;
	Sub = Subsystem;
	WorldBridge = Bridge;
	DefaultMeshAsset = DefaultMesh;

	if (Sub)
	{
		Sub->OnSnapshot.RemoveDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
		Sub->OnSnapshot.AddDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
	}
}

void USimgridEntityManager::BeginDestroy()
{
	if (Sub)
	{
		Sub->OnSnapshot.RemoveDynamic(this, &USimgridEntityManager::OnSnapshotReceived);
	}
	Super::BeginDestroy();
}

void USimgridEntityManager::OnSnapshotReceived()
{
	if (Sub)
	{
		Interp.Push(Sub->GetLastSnapshot());
	}
}

FVector USimgridEntityManager::ResolveWorldPos(const FSimgridInterpState& S) const
{
	const float Height = WorldBridge ? WorldBridge->SampleHeight((float)S.WorldXY.X, (float)S.WorldXY.Y) : 0.0f;
	const float Z = Height + (float)S.Z * FSimgridCoords::FLOOR_HEIGHT;
	return FVector(S.WorldXY.X, S.WorldXY.Y, Z);
}

ASimgridEntityActor* USimgridEntityManager::SpawnActor(uint16 Kind)
{
	UWorld* World = WorldPtr.Get();
	if (!World)
	{
		return nullptr;
	}

	FActorSpawnParameters Params;
	Params.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	ASimgridEntityActor* Actor = World->SpawnActor<ASimgridEntityActor>(ASimgridEntityActor::StaticClass(), FTransform::Identity, Params);
	if (Actor)
	{
		Actor->SetMesh(DefaultMeshAsset);
	}
	return Actor;
}

void USimgridEntityManager::Tick(double NowMs)
{
	if (!Interp.HasData())
	{
		return;
	}

	const double RenderTime = NowMs - FSimgridInterpolator::INTERP_DELAY_MS;
	const TArray<FSimgridEntityDelta>& Keyframe = Interp.LatestEntities();

	bHasLocalPos = false;

	for (const FSimgridEntityDelta& E : Keyframe)
	{
		FSimgridInterpState S;
		if (!Interp.SampleEntity(E.Eid, RenderTime, S))
		{
			continue;
		}

		const FVector WorldPos = ResolveWorldPos(S);
		const float Yaw = FSimgridCoords::FacingToYaw(S.Facing);

		const bool bIsLocal = (LocalSlot >= 0) && ((int32)S.Owner == LocalSlot) && (S.MaxHp > 0);
		if (bIsLocal)
		{
			bHasLocalPos = true;
			LocalWorldPos = WorldPos;

			AActor* Pawn = LocalPawn.Get();
			if (Pawn)
			{
				if (IKBVEMovementDriver* Driver = Cast<IKBVEMovementDriver>(Pawn))
				{
					Driver->ApplyServerCorrection(WorldPos, FVector(S.VelXY.X, S.VelXY.Y, 0.0f));
				}
			}
			continue;
		}

		TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(E.Eid);
		ASimgridEntityActor* Actor = Found ? Found->Get() : nullptr;
		if (!Actor)
		{
			Actor = SpawnActor(S.Kind);
			if (!Actor)
			{
				continue;
			}
			Actors.Add(E.Eid, Actor);
		}
		Actor->ApplyState(WorldPos, Yaw, S.Kind);
	}

	TSet<uint32> Live;
	Actors.GetKeys(Live);

	TSet<uint32> Gone = FSimgridReconcile::DespawnSet(Live, Keyframe);
	Gone.Append(FSimgridReconcile::DestroyedIds(Keyframe));

	for (const uint32 Eid : Gone)
	{
		if (TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
		{
			if (ASimgridEntityActor* Actor = Found->Get())
			{
				Actor->Destroy();
			}
			Actors.Remove(Eid);
		}
	}
}

bool USimgridEntityManager::WorldPosOf(uint32 Eid, FVector& OutPos) const
{
	if (const TObjectPtr<ASimgridEntityActor>* Found = Actors.Find(Eid))
	{
		if (const ASimgridEntityActor* Actor = Found->Get())
		{
			OutPos = Actor->GetActorLocation();
			return true;
		}
	}
	return false;
}

bool USimgridEntityManager::IsLocalWorldPos(FVector& OutPos) const
{
	OutPos = LocalWorldPos;
	return bHasLocalPos;
}

void USimgridEntityManager::Clear()
{
	for (TPair<uint32, TObjectPtr<ASimgridEntityActor>>& Pair : Actors)
	{
		if (ASimgridEntityActor* Actor = Pair.Value.Get())
		{
			Actor->Destroy();
		}
	}
	Actors.Empty();
	bHasLocalPos = false;
}
