#include "HexWorldTestActor.h"
#include "HexWorldSubsystem.h"
#include "HexWorldSeedSubsystem.h"
#include "HexEnvironmentSubsystem.h"
#include "HexNoiseSubsystem.h"
#include "HexTerrainActor.h"

DEFINE_LOG_CATEGORY_STATIC(LogKBVEHexWorldTest, Log, All);

AHexWorldTestActor::AHexWorldTestActor()
{
	PrimaryActorTick.bCanEverTick = false;
}

void AHexWorldTestActor::BeginPlay()
{
	Super::BeginPlay();

	UGameInstance* GI = GetGameInstance();
	if (!GI)
	{
		UE_LOG(LogKBVEHexWorldTest, Error, TEXT("No GameInstance found."));
		return;
	}

	UHexWorldSubsystem* HexWorld = GI->GetSubsystem<UHexWorldSubsystem>();
	UHexWorldSeedSubsystem* SeedSys = GI->GetSubsystem<UHexWorldSeedSubsystem>();

	if (!HexWorld || !SeedSys)
	{
		UE_LOG(LogKBVEHexWorldTest, Error, TEXT("Failed to get HexWorld subsystems."));
		return;
	}

	// -- Seed --
	FWorldSeedKey SeedKey;
	SeedKey.WorldSeed = TestWorldSeed;
	SeedKey.ContentVersion = TestContentVersion;
	SeedSys->SetWorldSeed(SeedKey);
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("World seed set: %lld (v%d)"), SeedKey.WorldSeed, SeedKey.ContentVersion);

	// -- Register hex [0,0] --
	FHexCellRecord Origin;
	Origin.Coord = FHexCoord(0, 0);
	Origin.RegionMode = EHexRegionMode::StaticAuthored;
	Origin.BiomeType = EHexBiomeType::Plains;
	Origin.PersistenceMode = EHexPersistenceMode::Canonical;
	Origin.RegionTag = TEXT("Capital");
	Origin.RegionSeed = SeedSys->DeriveRegionSeed(Origin.Coord);
	HexWorld->RegisterHexCell(Origin);

	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Registered hex %s — %s, seed: %lld"),
		*Origin.Coord.ToString(), *Origin.RegionTag.ToString(), Origin.RegionSeed);

	// -- Register hex [1,0] as a neighbor --
	FHexCellRecord Forest;
	Forest.Coord = FHexCoord(1, 0);
	Forest.RegionMode = EHexRegionMode::FiniteProcedural;
	Forest.BiomeType = EHexBiomeType::Forest;
	Forest.PersistenceMode = EHexPersistenceMode::DeterministicRegenerate;
	Forest.RegionTag = TEXT("FrontierForest");
	Forest.RegionSeed = SeedSys->DeriveRegionSeed(Forest.Coord);
	HexWorld->RegisterHexCell(Forest);

	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Registered hex %s — %s, seed: %lld"),
		*Forest.Coord.ToString(), *Forest.RegionTag.ToString(), Forest.RegionSeed);

	// -- Travel link: [0,0] <-> [1,0] --
	FHexTravelLink LinkForward;
	LinkForward.From = Origin.Coord;
	LinkForward.To = Forest.Coord;
	LinkForward.TravelType = EHexTravelType::Open;
	HexWorld->AddTravelLink(LinkForward);

	FHexTravelLink LinkBack;
	LinkBack.From = Forest.Coord;
	LinkBack.To = Origin.Coord;
	LinkBack.TravelType = EHexTravelType::Open;
	HexWorld->AddTravelLink(LinkBack);

	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Linked %s <-> %s (Open)"),
		*Origin.Coord.ToString(), *Forest.Coord.ToString());

	// -- Query tests --
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Hex count: %d"), HexWorld->GetHexCount());

	const bool bCanTravel = HexWorld->CanTravelTo(Origin.Coord, Forest.Coord);
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Can travel %s -> %s: %s"),
		*Origin.Coord.ToString(), *Forest.Coord.ToString(), bCanTravel ? TEXT("YES") : TEXT("NO"));

	TArray<FHexCoord> Traversable = HexWorld->GetTraversableNeighbors(Origin.Coord);
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Traversable neighbors from %s: %d"), *Origin.Coord.ToString(), Traversable.Num());
	for (const FHexCoord& Coord : Traversable)
	{
		UE_LOG(LogKBVEHexWorldTest, Log, TEXT("  -> %s"), *Coord.ToString());
	}

	// -- Seed determinism check --
	const int64 SeedA = SeedSys->DeriveRegionSeed(Origin.Coord);
	const int64 SeedB = SeedSys->DeriveRegionSeed(Origin.Coord);
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Determinism check: %lld == %lld : %s"),
		SeedA, SeedB, (SeedA == SeedB) ? TEXT("PASS") : TEXT("FAIL"));

	// -- World position round-trip --
	const FVector WorldPos = HexWorld->HexToWorldPosition(Forest.Coord);
	const FHexCoord RoundTrip = HexWorld->WorldPositionToHex(WorldPos);
	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Round-trip: %s -> (%.0f, %.0f, %.0f) -> %s : %s"),
		*Forest.Coord.ToString(), WorldPos.X, WorldPos.Y, WorldPos.Z,
		*RoundTrip.ToString(),
		(RoundTrip == Forest.Coord) ? TEXT("PASS") : TEXT("FAIL"));

	// -- Environment: spawn sky/sun/fog for hex [0,0] biome --
	UHexEnvironmentSubsystem* EnvSys = GI->GetSubsystem<UHexEnvironmentSubsystem>();
	if (EnvSys)
	{
		EnvSys->ApplyBiome(GetWorld(), Origin.BiomeType);
		UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Applied environment for biome: Plains"));
	}

	// -- Terrain: spawn procedural mesh for each hex --
	const FHexNoiseSettings OriginNoise = UHexNoiseSubsystem::GetDefaultNoiseForBiome(Origin.BiomeType);
	const FHexNoiseSettings ForestNoise = UHexNoiseSubsystem::GetDefaultNoiseForBiome(Forest.BiomeType);
	const double CurrentHexSize = HexWorld->GetHexSize();

	FActorSpawnParameters TerrainSpawn;
	TerrainSpawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

	// Hex [0,0] terrain -- LOD 0 (close, full detail, collision)
	TerrainSpawn.Name = TEXT("KBVEHexTerrain_0_0");
	AHexTerrainActor* Terrain0 = GetWorld()->SpawnActor<AHexTerrainActor>(
		FVector::ZeroVector, FRotator::ZeroRotator, TerrainSpawn);
	if (Terrain0)
	{
		Terrain0->SetLODPreset(0);
		Terrain0->GenerateTerrain(
			HexWorld->HexToWorldPosition(Origin.Coord),
			CurrentHexSize,
			Origin.RegionSeed,
			OriginNoise);
		UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Spawned terrain for hex %s (LOD 0)"), *Origin.Coord.ToString());
	}

	// Hex [1,0] terrain -- LOD 1 (mid distance, no collision)
	TerrainSpawn.Name = TEXT("KBVEHexTerrain_1_0");
	AHexTerrainActor* Terrain1 = GetWorld()->SpawnActor<AHexTerrainActor>(
		FVector::ZeroVector, FRotator::ZeroRotator, TerrainSpawn);
	if (Terrain1)
	{
		Terrain1->SetLODPreset(1);
		Terrain1->GenerateTerrain(
			HexWorld->HexToWorldPosition(Forest.Coord),
			CurrentHexSize,
			Forest.RegionSeed,
			ForestNoise);
		UE_LOG(LogKBVEHexWorldTest, Log, TEXT("Spawned terrain for hex %s (LOD 1)"), *Forest.Coord.ToString());
	}

	UE_LOG(LogKBVEHexWorldTest, Log, TEXT("=== KBVEHexWorld test complete ==="));
}
