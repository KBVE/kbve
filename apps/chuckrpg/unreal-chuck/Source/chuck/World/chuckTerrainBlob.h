#pragma once

#include "CoreMinimal.h"
#include "ProceduralMeshComponent.h"

struct FchuckChunkMesh
{
	int32 CellsPerEdge = 0;
	float CellSize     = 0.f;
	TArray<FVector>          Vertices;
	TArray<int32>            Triangles;
	TArray<FVector>          Normals;
	TArray<FVector2D>        UVs;
	TArray<FProcMeshTangent> Tangents;

	bool IsValidMesh() const
	{
		return CellsPerEdge > 0 && Vertices.Num() > 0 && Triangles.Num() > 0;
	}

	void Serialize(FArchive& Ar)
	{
		int32 Version = 1;
		Ar << Version;
		Ar << CellsPerEdge;
		Ar << CellSize;
		Ar << Vertices;
		Ar << Triangles;
		Ar << Normals;
		Ar << UVs;
		int32 TangentCount = Tangents.Num();
		Ar << TangentCount;
		if (Ar.IsLoading()) Tangents.SetNumUninitialized(TangentCount);
		for (int32 i = 0; i < TangentCount; ++i)
		{
			Ar << Tangents[i].TangentX;
			uint8 FlipBin = Tangents[i].bFlipTangentY ? 1 : 0;
			Ar << FlipBin;
			if (Ar.IsLoading()) Tangents[i].bFlipTangentY = (FlipBin != 0);
		}
	}
};
