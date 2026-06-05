#pragma once

#include "CoreMinimal.h"

// File-per-chunk binary cache. Path layout:
//   <RootDir>/<seed>/<x>_<y>.bin
// Each blob is a versioned FArchive payload of FchuckChunkMesh. Designed so
// future migration to SQLite / shared world DB is a backend swap without
// touching the streamer.
class FchuckTerrainCache
{
public:
	FchuckTerrainCache() = default;
	~FchuckTerrainCache();

	bool Open(const FString& DbPath);
	void Close();
	bool IsOpen() const { return bOpen; }

	bool Read (uint32 Seed, const FIntPoint& Coord, TArray<uint8>& OutBlob);
	bool Write(uint32 Seed, const FIntPoint& Coord, const TArray<uint8>& Blob);

private:
	FString RootDir;
	bool    bOpen = false;
};
