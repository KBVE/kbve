#include "KBVEWorldChunkDirty.h"

void UKBVEWorldChunkDirtySubsystem::Mark(const FIntPoint& Chunk)
{
	FScopeLock Lock(&Guard);
	Stale.Add(Chunk);
}

bool UKBVEWorldChunkDirtySubsystem::Take(const FIntPoint& Chunk)
{
	FScopeLock Lock(&Guard);
	return Stale.Remove(Chunk) > 0;
}

void UKBVEWorldChunkDirtySubsystem::Forget(const FIntPoint& Chunk)
{
	FScopeLock Lock(&Guard);
	Stale.Remove(Chunk);
}
