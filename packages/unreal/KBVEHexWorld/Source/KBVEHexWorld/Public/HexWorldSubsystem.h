#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "KBVEHexWorldTypes.h"
#include "HexWorldSubsystem.generated.h"

UCLASS()
class KBVEHEXWORLD_API UHexWorldSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	// --- Map Population ------------------------------------------

	/** Register a hex cell in the master map. Overwrites if coord already exists. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	void RegisterHexCell(const FHexCellRecord& Record);

	/** Remove a hex cell from the master map. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	void UnregisterHexCell(const FHexCoord& Coord);

	/** Bulk-register cells (e.g. from a data table or asset). */
	void RegisterHexCells(TArrayView<const FHexCellRecord> Records);

	// --- Queries -------------------------------------------------

	/** Get the cell record for a given hex coordinate. Returns false if not found. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	bool GetHexCell(const FHexCoord& Coord, FHexCellRecord& OutRecord) const;

	/** Get all registered hex coordinates. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	TArray<FHexCoord> GetAllHexCoords() const;

	/** Get registered neighbors of a hex. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	TArray<FHexCellRecord> GetNeighbors(const FHexCoord& Coord) const;

	/** Find which hex a world-space position falls in. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	FHexCoord WorldPositionToHex(const FVector& WorldPosition) const;

	/** Get the world-space center of a hex. Returns (X, Y, 0). */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	FVector HexToWorldPosition(const FHexCoord& Coord) const;

	/** Get all cells within a given axial distance from a center hex. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Map")
	TArray<FHexCellRecord> GetHexesInRange(const FHexCoord& Center, int32 Range) const;

	// --- Travel Links --------------------------------------------

	/** Add a travel link between two hexes. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Travel")
	void AddTravelLink(const FHexTravelLink& Link);

	/** Remove all travel links between two hexes (both directions). */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Travel")
	void RemoveTravelLinks(const FHexCoord& A, const FHexCoord& B);

	/** Get all outgoing travel links from a hex. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Travel")
	TArray<FHexTravelLink> GetTravelLinksFrom(const FHexCoord& Coord) const;

	/** Check if travel is possible from A to B. */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Travel")
	bool CanTravelTo(const FHexCoord& From, const FHexCoord& To) const;

	/** Get all traversable neighbor hexes (registered + has an open/gated link). */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Travel")
	TArray<FHexCoord> GetTraversableNeighbors(const FHexCoord& Coord) const;

	// --- Configuration -------------------------------------------

	/** Set the world-space size of each hex (center to vertex distance in UU). */
	UFUNCTION(BlueprintCallable, Category = "HexWorld|Config")
	void SetHexSize(double NewHexSize);

	UFUNCTION(BlueprintPure, Category = "HexWorld|Config")
	double GetHexSize() const { return HexSize; }

	UFUNCTION(BlueprintPure, Category = "HexWorld|Map")
	int32 GetHexCount() const { return HexMap.Num(); }

private:
	TMap<FHexCoord, FHexCellRecord> HexMap;

	/** Travel links keyed by source hex. A hex can have multiple outgoing links. */
	TMultiMap<FHexCoord, FHexTravelLink> TravelLinks;

	/** Hex size in Unreal units (center to vertex). Default 50000 = 500m. */
	double HexSize = 50000.0;
};
