#include "KBVEWorldGrassData.h"

FKBVEWorldGrassClusterPool& FKBVEWorldGrassClusterPool::Get()
{
	static FKBVEWorldGrassClusterPool Singleton;
	return Singleton;
}

const FKBVEGrassCluster* FKBVEWorldGrassClusterPool::FindCluster(uint32 ClusterHash) const
{
	return Clusters.Find(ClusterHash);
}

FKBVEGrassCluster& FKBVEWorldGrassClusterPool::AcquireCluster(uint32 ClusterHash)
{
	if (FKBVEGrassCluster* Existing = Clusters.Find(ClusterHash))
	{
		return *Existing;
	}
	FKBVEGrassCluster& C = Clusters.Add(ClusterHash);
	C.ClusterHash = ClusterHash;
	return C;
}

void FKBVEWorldGrassClusterPool::ReleaseCluster(uint32 ClusterHash)
{
	FKBVEGrassCluster* C = Clusters.Find(ClusterHash);
	if (!C) return;
	if (C->BladeCount > 0)
	{
		FreeBladeRuns.Add(C->BladeStart);
	}
	Clusters.Remove(ClusterHash);
}

void FKBVEWorldGrassClusterPool::ReleaseAll()
{
	Clusters.Reset();
	Blades.Reset();
	FreeBladeRuns.Reset();
}

TArrayView<const FKBVEGrassBladePacked> FKBVEWorldGrassClusterPool::GetBlades(const FKBVEGrassCluster& Cluster) const
{
	if (Cluster.BladeCount == 0 || Cluster.BladeStart >= uint32(Blades.Num()))
	{
		return TArrayView<const FKBVEGrassBladePacked>();
	}
	const uint32 End = FMath::Min<uint32>(Cluster.BladeStart + Cluster.BladeCount, uint32(Blades.Num()));
	return TArrayView<const FKBVEGrassBladePacked>(&Blades[Cluster.BladeStart], int32(End - Cluster.BladeStart));
}

TArrayView<FKBVEGrassBladePacked> FKBVEWorldGrassClusterPool::AllocateBladeRun(FKBVEGrassCluster& Cluster, uint32 Count)
{
	const uint32 Start = uint32(Blades.AddDefaulted(int32(Count)));
	Cluster.BladeStart = Start;
	Cluster.BladeCount = Count;
	return TArrayView<FKBVEGrassBladePacked>(&Blades[Start], int32(Count));
}
