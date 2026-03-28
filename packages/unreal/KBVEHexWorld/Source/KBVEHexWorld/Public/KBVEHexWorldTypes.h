#pragma once

#include "CoreMinimal.h"
#include "KBVEHexWorldTypes.generated.h"

// --- Enums -------------------------------------------------------

UENUM(BlueprintType)
enum class EHexRegionMode : uint8
{
	StaticAuthored        UMETA(DisplayName = "Static Authored"),
	FiniteProcedural      UMETA(DisplayName = "Finite Procedural"),
	InfiniteProcedural    UMETA(DisplayName = "Infinite Procedural"),
	Instanced             UMETA(DisplayName = "Instanced"),
	Transit               UMETA(DisplayName = "Transit")
};

UENUM(BlueprintType)
enum class EHexBiomeType : uint8
{
	None,
	Plains,
	Forest,
	Swamp,
	Ruins,
	Mountain,
	Desert,
	Coastal,
	Underground
};

UENUM(BlueprintType)
enum class EHexPersistenceMode : uint8
{
	Canonical                 UMETA(DisplayName = "Canonical"),
	DeterministicRegenerate   UMETA(DisplayName = "Deterministic Regenerate"),
	DeltaPersistent           UMETA(DisplayName = "Delta Persistent"),
	SessionOnly               UMETA(DisplayName = "Session Only")
};

// --- Hex Coordinate (axial Q, R) ---------------------------------

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FHexCoord
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld")
	int32 Q = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld")
	int32 R = 0;

	FHexCoord() = default;
	FHexCoord(int32 InQ, int32 InR) : Q(InQ), R(InR) {}

	/** Cube coordinate S is implicit: S = -Q - R */
	int32 GetS() const { return -Q - R; }

	/** Axial distance between two hex coordinates. */
	int32 DistanceTo(const FHexCoord& Other) const
	{
		const int32 DQ = FMath::Abs(Q - Other.Q);
		const int32 DR = FMath::Abs(R - Other.R);
		const int32 DS = FMath::Abs(GetS() - Other.GetS());
		return FMath::Max3(DQ, DR, DS);
	}

	/** Returns the 6 axial neighbors. */
	TArray<FHexCoord, TFixedAllocator<6>> GetNeighbors() const
	{
		return {
			FHexCoord(Q + 1, R    ),
			FHexCoord(Q + 1, R - 1),
			FHexCoord(Q,     R - 1),
			FHexCoord(Q - 1, R    ),
			FHexCoord(Q - 1, R + 1),
			FHexCoord(Q,     R + 1)
		};
	}

	/** Convert hex coord to world-space center (flat-top hex). */
	FVector2D ToWorld(double HexSize) const
	{
		const double X = HexSize * (1.5 * Q);
		const double Y = HexSize * (FMath::Sqrt(3.0) * 0.5 * Q + FMath::Sqrt(3.0) * R);
		return FVector2D(X, Y);
	}

	/** Convert world-space position to nearest hex coord (flat-top hex). */
	static FHexCoord FromWorld(const FVector2D& WorldPos, double HexSize)
	{
		const double FQ = (2.0 / 3.0) * WorldPos.X / HexSize;
		const double FR = (-1.0 / 3.0) * WorldPos.X / HexSize + (FMath::Sqrt(3.0) / 3.0) * WorldPos.Y / HexSize;

		// Cube-coordinate rounding
		const double FS = -FQ - FR;
		int32 RQ = FMath::RoundToInt32(FQ);
		int32 RR = FMath::RoundToInt32(FR);
		int32 RS = FMath::RoundToInt32(FS);

		const double DiffQ = FMath::Abs(RQ - FQ);
		const double DiffR = FMath::Abs(RR - FR);
		const double DiffS = FMath::Abs(RS - FS);

		if (DiffQ > DiffR && DiffQ > DiffS)
		{
			RQ = -RR - RS;
		}
		else if (DiffR > DiffS)
		{
			RR = -RQ - RS;
		}

		return FHexCoord(RQ, RR);
	}

	bool operator==(const FHexCoord& Other) const { return Q == Other.Q && R == Other.R; }
	bool operator!=(const FHexCoord& Other) const { return !(*this == Other); }

	friend uint32 GetTypeHash(const FHexCoord& Coord)
	{
		return HashCombine(::GetTypeHash(Coord.Q), ::GetTypeHash(Coord.R));
	}

	FString ToString() const { return FString::Printf(TEXT("(%d,%d)"), Q, R); }
};

// --- World Seed Key ----------------------------------------------

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FWorldSeedKey
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Seed")
	int64 WorldSeed = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Seed")
	int32 ContentVersion = 1;
};

// --- Generated Descriptor ID -------------------------------------

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FGeneratedDescriptorId
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Descriptor")
	int64 Hash = 0;

	bool IsValid() const { return Hash != 0; }

	bool operator==(const FGeneratedDescriptorId& Other) const { return Hash == Other.Hash; }
	bool operator!=(const FGeneratedDescriptorId& Other) const { return Hash != Other.Hash; }

	friend uint32 GetTypeHash(const FGeneratedDescriptorId& Id)
	{
		return ::GetTypeHash(Id.Hash);
	}
};

// --- Spawn Descriptor --------------------------------------------

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FSpawnDescriptor
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Descriptor")
	FGeneratedDescriptorId PersistenceId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Descriptor")
	FName ArchetypeId;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Descriptor")
	FTransform Transform;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Descriptor")
	uint8 StateFlags = 0;
};

// --- Travel Link -------------------------------------------------

UENUM(BlueprintType)
enum class EHexTravelType : uint8
{
	Open          UMETA(DisplayName = "Open"),
	Gated         UMETA(DisplayName = "Gated"),
	OneWay        UMETA(DisplayName = "One Way"),
	Blocked       UMETA(DisplayName = "Blocked")
};

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FHexTravelLink
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Travel")
	FHexCoord From;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Travel")
	FHexCoord To;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Travel")
	EHexTravelType TravelType = EHexTravelType::Open;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Travel")
	FName TravelTag;
};

// --- Hex Cell Record ---------------------------------------------

USTRUCT(BlueprintType)
struct KBVEHEXWORLD_API FHexCellRecord
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	FHexCoord Coord;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	EHexRegionMode RegionMode = EHexRegionMode::StaticAuthored;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	EHexBiomeType BiomeType = EHexBiomeType::None;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	EHexPersistenceMode PersistenceMode = EHexPersistenceMode::Canonical;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	int64 RegionSeed = 0;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "HexWorld|Cell")
	FName RegionTag;
};
