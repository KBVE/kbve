#include "KBVEWorldChunkBlob.h"

void FKBVEWorldChunkMesh::Generate(FKBVEWorldChunkMesh& OutMesh, const FIntPoint& Coord, int32 CellsPerEdge, float CellSize, float EdgeSkirtDepth, TFunctionRef<float(float, float)> Height)
{
	const int32 VertsPerEdge = CellsPerEdge + 1;
	const int32 VertCount    = VertsPerEdge * VertsPerEdge;
	OutMesh.CellsPerEdge = CellsPerEdge;
	OutMesh.CellSize     = CellSize;
	OutMesh.Vertices.SetNumUninitialized(VertCount);
	OutMesh.Normals.Init(FVector::UpVector, VertCount);
	OutMesh.UVs.SetNumUninitialized(VertCount);
	OutMesh.Tangents.Init(FProcMeshTangent(1.f, 0.f, 0.f), VertCount);

	const FVector ChunkOrigin(Coord.X * CellsPerEdge * CellSize, Coord.Y * CellsPerEdge * CellSize, 0.f);
	for (int32 Y = 0; Y < VertsPerEdge; ++Y)
	{
		for (int32 X = 0; X < VertsPerEdge; ++X)
		{
			const int32 Idx = Y * VertsPerEdge + X;
			const float Lx = X * CellSize;
			const float Ly = Y * CellSize;
			const float Wx = ChunkOrigin.X + Lx;
			const float Wy = ChunkOrigin.Y + Ly;
			const float Z  = Height(Wx, Wy);
			OutMesh.Vertices[Idx] = FVector(Lx, Ly, Z);
			OutMesh.UVs[Idx]      = FVector2D((float)X / CellsPerEdge, (float)Y / CellsPerEdge);
		}
	}

	OutMesh.Triangles.Reserve(CellsPerEdge * CellsPerEdge * 6);
	for (int32 Y = 0; Y < CellsPerEdge; ++Y)
	{
		for (int32 X = 0; X < CellsPerEdge; ++X)
		{
			const int32 TL = (Y + 0) * VertsPerEdge + (X + 0);
			const int32 TR = (Y + 0) * VertsPerEdge + (X + 1);
			const int32 BL = (Y + 1) * VertsPerEdge + (X + 0);
			const int32 BR = (Y + 1) * VertsPerEdge + (X + 1);
			OutMesh.Triangles.Add(TL); OutMesh.Triangles.Add(BL); OutMesh.Triangles.Add(TR);
			OutMesh.Triangles.Add(TR); OutMesh.Triangles.Add(BL); OutMesh.Triangles.Add(BR);
		}
	}

	if (EdgeSkirtDepth > 0.f)
	{
		auto AddSkirtVert = [&](float Lx, float Ly, float Z) -> int32
		{
			const int32 Idx = OutMesh.Vertices.Num();
			OutMesh.Vertices.Add(FVector(Lx, Ly, Z - EdgeSkirtDepth));
			OutMesh.Normals.Add(FVector::UpVector);
			OutMesh.UVs.Add(FVector2D(0.f, 0.f));
			OutMesh.Tangents.Add(FProcMeshTangent(1.f, 0.f, 0.f));
			return Idx;
		};

		const int32 Last = VertsPerEdge - 1;
		auto TopIdx = [&](int32 X, int32 Y) { return Y * VertsPerEdge + X; };

		for (int32 X = 0; X < Last; ++X)
		{
			const int32 T0 = TopIdx(X,     0);
			const int32 T1 = TopIdx(X + 1, 0);
			const int32 S0 = AddSkirtVert(X * CellSize, 0.f, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert((X + 1) * CellSize, 0.f, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S1); OutMesh.Triangles.Add(S0);
		}
		for (int32 X = 0; X < Last; ++X)
		{
			const int32 T0 = TopIdx(X,     Last);
			const int32 T1 = TopIdx(X + 1, Last);
			const int32 S0 = AddSkirtVert(X * CellSize, Last * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert((X + 1) * CellSize, Last * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(T1);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(S1);
		}
		for (int32 Y = 0; Y < Last; ++Y)
		{
			const int32 T0 = TopIdx(0, Y);
			const int32 T1 = TopIdx(0, Y + 1);
			const int32 S0 = AddSkirtVert(0.f, Y * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert(0.f, (Y + 1) * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(T1);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0); OutMesh.Triangles.Add(S1);
		}
		for (int32 Y = 0; Y < Last; ++Y)
		{
			const int32 T0 = TopIdx(Last, Y);
			const int32 T1 = TopIdx(Last, Y + 1);
			const int32 S0 = AddSkirtVert(Last * CellSize, Y * CellSize, OutMesh.Vertices[T0].Z);
			const int32 S1 = AddSkirtVert(Last * CellSize, (Y + 1) * CellSize, OutMesh.Vertices[T1].Z);
			OutMesh.Triangles.Add(T0); OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S0);
			OutMesh.Triangles.Add(T1); OutMesh.Triangles.Add(S1); OutMesh.Triangles.Add(S0);
		}
	}

	for (int32 Y = 0; Y < VertsPerEdge; ++Y)
	{
		for (int32 X = 0; X < VertsPerEdge; ++X)
		{
			const int32 Idx = Y * VertsPerEdge + X;
			const int32 Xm = FMath::Max(X - 1, 0);
			const int32 Xp = FMath::Min(X + 1, VertsPerEdge - 1);
			const int32 Ym = FMath::Max(Y - 1, 0);
			const int32 Yp = FMath::Min(Y + 1, VertsPerEdge - 1);
			const float Hl = OutMesh.Vertices[Y * VertsPerEdge + Xm].Z;
			const float Hr = OutMesh.Vertices[Y * VertsPerEdge + Xp].Z;
			const float Hd = OutMesh.Vertices[Ym * VertsPerEdge + X].Z;
			const float Hu = OutMesh.Vertices[Yp * VertsPerEdge + X].Z;
			const float dzdx = (Hr - Hl) / ((Xp - Xm) * CellSize);
			const float dzdy = (Hu - Hd) / ((Yp - Ym) * CellSize);
			OutMesh.Normals[Idx]  = FVector(-dzdx, -dzdy, 1.f).GetSafeNormal();
			OutMesh.Tangents[Idx] = FProcMeshTangent(FVector(1.f, 0.f, dzdx).GetSafeNormal(), false);
		}
	}
}
