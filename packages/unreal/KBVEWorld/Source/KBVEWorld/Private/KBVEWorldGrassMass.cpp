#include "KBVEWorldGrassMass.h"

#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/World.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/PlayerController.h"
#include "KBVEWorldGrassRenderSubsystem.h"
#include "MassEntityManager.h"
#include "MassExecutionContext.h"

UKBVEGrassClusterProcessor::UKBVEGrassClusterProcessor()
	: ClusterQuery(*this)
{
	ExecutionFlags = (uint8)EProcessorExecutionFlags::All;
	ProcessingPhase = EMassProcessingPhase::PrePhysics;
	bAutoRegisterWithProcessingPhases = true;
	bRequiresGameThreadExecution = true;
}

void UKBVEGrassClusterProcessor::ConfigureQueries(const TSharedRef<FMassEntityManager>& EntityManager)
{
	ClusterQuery.AddRequirement<FKBVEGrassClusterFragment>(EMassFragmentAccess::ReadWrite);
	ClusterQuery.AddTagRequirement<FKBVEGrassClusterTag>(EMassFragmentPresence::All);
}

namespace
{
	FIntPoint WorldToChunk(const FVector& WorldLoc, float ChunkExtent)
	{
		return FIntPoint(
			FMath::FloorToInt(WorldLoc.X / ChunkExtent),
			FMath::FloorToInt(WorldLoc.Y / ChunkExtent));
	}

	int32 ChebyshevChunkDist(const FVector3f& ClusterOrigin, FIntPoint PlayerChunk, float ChunkExtent)
	{
		const int32 Cx = FMath::FloorToInt(ClusterOrigin.X / ChunkExtent);
		const int32 Cy = FMath::FloorToInt(ClusterOrigin.Y / ChunkExtent);
		return FMath::Max(FMath::Abs(Cx - PlayerChunk.X), FMath::Abs(Cy - PlayerChunk.Y));
	}
}

void UKBVEGrassClusterProcessor::Execute(FMassEntityManager& EntityManager, FMassExecutionContext& Context)
{
	UWorld* World = EntityManager.GetWorld();
	if (!World) return;

	static int32 ExecCount = 0;
	if ((++ExecCount % 120) == 0)
	{
		UE_LOG(LogTemp, Warning, TEXT("[KBVEGrass] Processor.Execute count=%d"), ExecCount);
	}

	APlayerController* PC = World->GetFirstPlayerController();
	APawn* Pawn = PC ? PC->GetPawn() : nullptr;
	if (!Pawn) return;

	constexpr float GrassPredictionSeconds = 0.20f;
	const FVector PawnLoc = Pawn->GetActorLocation() + Pawn->GetVelocity() * GrassPredictionSeconds;

	constexpr float ChunkExtent = 6400.f;
	const FIntPoint PlayerChunk = WorldToChunk(PawnLoc, ChunkExtent);

	if (PlayerChunk != LastPlayerChunk)
	{
		LastPlayerChunk = PlayerChunk;

		ClusterQuery.ForEachEntityChunk(Context, [PlayerChunk, ChunkExtent](FMassExecutionContext& ChunkContext)
		{
			const TArrayView<FKBVEGrassClusterFragment> Clusters = ChunkContext.GetMutableFragmentView<FKBVEGrassClusterFragment>();

			for (FKBVEGrassClusterFragment& Cluster : Clusters)
			{
				const int32 Dist = ChebyshevChunkDist(Cluster.Origin, PlayerChunk, ChunkExtent);

				EKBVEGrassLODTier Tier;
				if      (Dist <= 0) Tier = EKBVEGrassLODTier::LOD0_RealBlade;
				else if (Dist <= 1) Tier = EKBVEGrassLODTier::LOD1_ReducedCard;
				else if (Dist <= 2) Tier = EKBVEGrassLODTier::LOD2_ThreeSheet;
				else if (Dist <= 3) Tier = EKBVEGrassLODTier::LOD3a_AtlasBillboard;
				else if (Dist <= 4) Tier = EKBVEGrassLODTier::LOD3b_GroundTint;
				else if (Dist <= 5) Tier = EKBVEGrassLODTier::LOD4_TerrainTint;
				else                Tier = EKBVEGrassLODTier::Inactive;

				Cluster.LODTier = (uint8)Tier;
			}
		});
	}
}
