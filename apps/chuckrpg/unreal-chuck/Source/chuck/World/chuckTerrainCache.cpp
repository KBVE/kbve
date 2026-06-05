#include "chuckTerrainCache.h"

#include "HAL/PlatformFileManager.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

namespace
{
	FString ChunkPath(const FString& RootDir, uint32 Seed, const FIntPoint& Coord)
	{
		return RootDir / FString::Printf(TEXT("%u/%d_%d.bin"), Seed, Coord.X, Coord.Y);
	}
}

FchuckTerrainCache::~FchuckTerrainCache()
{
	Close();
}

bool FchuckTerrainCache::Open(const FString& DbPath)
{
	RootDir = FPaths::GetPath(DbPath);
	if (RootDir.IsEmpty()) RootDir = DbPath;
	IPlatformFile& FS = FPlatformFileManager::Get().GetPlatformFile();
	FS.CreateDirectoryTree(*RootDir);
	bOpen = FS.DirectoryExists(*RootDir);
	return bOpen;
}

void FchuckTerrainCache::Close()
{
	bOpen = false;
	RootDir.Empty();
}

bool FchuckTerrainCache::Read(uint32 Seed, const FIntPoint& Coord, TArray<uint8>& OutBlob)
{
	if (!bOpen) return false;
	const FString Path = ChunkPath(RootDir, Seed, Coord);
	if (!FPaths::FileExists(Path)) return false;
	return FFileHelper::LoadFileToArray(OutBlob, *Path);
}

bool FchuckTerrainCache::Write(uint32 Seed, const FIntPoint& Coord, const TArray<uint8>& Blob)
{
	if (!bOpen || Blob.Num() == 0) return false;
	const FString Path = ChunkPath(RootDir, Seed, Coord);
	IPlatformFile& FS = FPlatformFileManager::Get().GetPlatformFile();
	FS.CreateDirectoryTree(*FPaths::GetPath(Path));
	return FFileHelper::SaveArrayToFile(Blob, *Path);
}
