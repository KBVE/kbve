#pragma once

#include "CoreMinimal.h"

class FchuckTerrainCache
{
public:
	FchuckTerrainCache() = default;
	~FchuckTerrainCache();

	bool Open(const FString& DbPath);
	void Close();
	bool IsOpen() const { return Db != nullptr; }

	bool Read   (uint32 Seed, const FIntPoint& Coord, TArray<uint8>& OutBlob);
	bool Write  (uint32 Seed, const FIntPoint& Coord, const TArray<uint8>& Blob);
	bool HasKey (uint32 Seed, const FIntPoint& Coord);

private:
	void* Db = nullptr;
};
