#include "HexWorldSubsystem.h"

void UHexWorldSubsystem::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
}

void UHexWorldSubsystem::Deinitialize()
{
	HexMap.Empty();
	TravelLinks.Empty();
	Super::Deinitialize();
}

// --- Map Population ----------------------------------------------

void UHexWorldSubsystem::RegisterHexCell(const FHexCellRecord& Record)
{
	HexMap.Add(Record.Coord, Record);
}

void UHexWorldSubsystem::UnregisterHexCell(const FHexCoord& Coord)
{
	HexMap.Remove(Coord);
}

void UHexWorldSubsystem::RegisterHexCells(TArrayView<const FHexCellRecord> Records)
{
	HexMap.Reserve(HexMap.Num() + Records.Num());
	for (const FHexCellRecord& Record : Records)
	{
		HexMap.Add(Record.Coord, Record);
	}
}

// --- Queries -----------------------------------------------------

bool UHexWorldSubsystem::GetHexCell(const FHexCoord& Coord, FHexCellRecord& OutRecord) const
{
	if (const FHexCellRecord* Found = HexMap.Find(Coord))
	{
		OutRecord = *Found;
		return true;
	}
	return false;
}

TArray<FHexCoord> UHexWorldSubsystem::GetAllHexCoords() const
{
	TArray<FHexCoord> Result;
	HexMap.GetKeys(Result);
	return Result;
}

TArray<FHexCellRecord> UHexWorldSubsystem::GetNeighbors(const FHexCoord& Coord) const
{
	TArray<FHexCellRecord> Result;
	for (const FHexCoord& Neighbor : Coord.GetNeighbors())
	{
		if (const FHexCellRecord* Found = HexMap.Find(Neighbor))
		{
			Result.Add(*Found);
		}
	}
	return Result;
}

FHexCoord UHexWorldSubsystem::WorldPositionToHex(const FVector& WorldPosition) const
{
	return FHexCoord::FromWorld(FVector2D(WorldPosition.X, WorldPosition.Y), HexSize);
}

FVector UHexWorldSubsystem::HexToWorldPosition(const FHexCoord& Coord) const
{
	const FVector2D Pos2D = Coord.ToWorld(HexSize);
	return FVector(Pos2D.X, Pos2D.Y, 0.0);
}

TArray<FHexCellRecord> UHexWorldSubsystem::GetHexesInRange(const FHexCoord& Center, int32 Range) const
{
	TArray<FHexCellRecord> Result;
	for (int32 DQ = -Range; DQ <= Range; ++DQ)
	{
		const int32 MinR = FMath::Max(-Range, -DQ - Range);
		const int32 MaxR = FMath::Min(Range, -DQ + Range);
		for (int32 DR = MinR; DR <= MaxR; ++DR)
		{
			const FHexCoord Coord(Center.Q + DQ, Center.R + DR);
			if (const FHexCellRecord* Found = HexMap.Find(Coord))
			{
				Result.Add(*Found);
			}
		}
	}
	return Result;
}

// --- Travel Links ------------------------------------------------

void UHexWorldSubsystem::AddTravelLink(const FHexTravelLink& Link)
{
	TravelLinks.Add(Link.From, Link);
}

void UHexWorldSubsystem::RemoveTravelLinks(const FHexCoord& A, const FHexCoord& B)
{
	// Remove A->B
	for (auto It = TravelLinks.CreateKeyIterator(A); It; ++It)
	{
		if (It.Value().To == B)
		{
			It.RemoveCurrent();
		}
	}
	// Remove B->A
	for (auto It = TravelLinks.CreateKeyIterator(B); It; ++It)
	{
		if (It.Value().To == A)
		{
			It.RemoveCurrent();
		}
	}
}

TArray<FHexTravelLink> UHexWorldSubsystem::GetTravelLinksFrom(const FHexCoord& Coord) const
{
	TArray<FHexTravelLink> Result;
	TravelLinks.MultiFind(Coord, Result);
	return Result;
}

bool UHexWorldSubsystem::CanTravelTo(const FHexCoord& From, const FHexCoord& To) const
{
	TArray<FHexTravelLink> Links;
	TravelLinks.MultiFind(From, Links);
	for (const FHexTravelLink& Link : Links)
	{
		if (Link.To == To && Link.TravelType != EHexTravelType::Blocked)
		{
			return true;
		}
	}
	return false;
}

TArray<FHexCoord> UHexWorldSubsystem::GetTraversableNeighbors(const FHexCoord& Coord) const
{
	TArray<FHexCoord> Result;
	TArray<FHexTravelLink> Links;
	TravelLinks.MultiFind(Coord, Links);
	for (const FHexTravelLink& Link : Links)
	{
		if (Link.TravelType != EHexTravelType::Blocked && HexMap.Contains(Link.To))
		{
			Result.Add(Link.To);
		}
	}
	return Result;
}

// --- Configuration -----------------------------------------------

void UHexWorldSubsystem::SetHexSize(double NewHexSize)
{
	HexSize = FMath::Max(1.0, NewHexSize);
}
