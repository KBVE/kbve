#include "KBVEWorldPatch.h"

#include "KBVEWorldHeightfield.h"

void FKBVEWorldPatchPlan::Build(const FKBVEWorldPatchPlan& Plan, TArray<float>& Padded,
	bool& bPaddedValid, FKBVEWorldPatchMesh& Out)
{
	// Stride never divides the patch into fewer than four quads; past that the
	// patch stops describing the ground at all and the skirt does the work.
	const double GenerateStart = FPlatformTime::Seconds();
	const int32 Step = FMath::Clamp(Plan.Step, 1, FMath::Max(1, Plan.CellsPerEdge / 4));
	const int32 Quads = Plan.CellsPerEdge / Step;
	const int32 Edge = Quads + 1;
	const int32 GridCount = Edge * Edge;
	const int32 Seed = FKBVEWorldHeightfield::SeedFromWorld(Plan.WorldSeed);
	const float VertexSize = Plan.CellSize * Step;
	const float TileStep = VertexSize / 100.0f;

	// Sampled one ring wider than the patch. Out.Normals come from central
	// differences, so an edge vertex needs the height of its neighbour in the
	// next patch over -- without that ring the difference is clamped at the
	// border and adjacent patches disagree about the surface, which shows up as
	// a lit seam along every chunk boundary.
	const int32 PadEdge = Edge + 2;

	// Generated once per stride and kept. The collision proxy asks for the same
	// stride as the drawn surface on every patch that carries collision, and the
	// heights it wants are the heights already computed -- it differs in its
	// skirts and its vertex colours, not in its ground.
	if (!bPaddedValid || Padded.Num() != PadEdge * PadEdge)
	{
		Padded.SetNumUninitialized(PadEdge * PadEdge);
		FKBVEWorldHeightfield::FillGrid(Plan.Shape, Seed,
			Plan.TileOrigin.X - TileStep, Plan.TileOrigin.Y - TileStep, TileStep, PadEdge, Padded);

		// Applied over the padded grid, before normals are taken from it, so the
		// cutting is lit as the shape it is rather than as the ground it replaced --
		// and so the ring shared with the next patch is levelled identically on both
		// sides and no seam opens along a road that crosses a chunk boundary.
		if (Plan.bHasRoad)
		{
			const float PadOrigin = -TileStep * 100.0f;
			const FVector2D Min(Plan.TileOrigin.X * 100.0f + PadOrigin, Plan.TileOrigin.Y * 100.0f + PadOrigin);
			const FVector2D Max = Min + FVector2D(PadEdge * VertexSize, PadEdge * VertexSize);
			// Already routed, by whoever took this look. A plan carries corridors
			// rather than a field that can build more of them, so there is
			// nothing here that could be building while this reads.
			const FKBVEWorldRoadLook* Field = &Plan.Road;
			float* const Heights = Padded.GetData();

			ParallelFor(PadEdge, [Field, Heights, Min, VertexSize, PadEdge](int32 Y)
			{
				const float Wy = Min.Y + Y * VertexSize;
				float* Row = Heights + Y * PadEdge;
				for (int32 X = 0; X < PadEdge; ++X)
				{
					Row[X] = Field->Level(Row[X], Min.X + X * VertexSize, Wy);
				}
			}, PadEdge >= 64 ? EParallelForFlags::None : EParallelForFlags::ForceSingleThread);
		}

		bPaddedValid = true;
		Out.FillMs += static_cast<float>((FPlatformTime::Seconds() - GenerateStart) * 1000.0);
	}


	auto PaddedAt = [&Padded, PadEdge](int32 X, int32 Y) -> float
	{
		return Padded[(Y + 1) * PadEdge + (X + 1)];
	};

	// Skirts hide LOD cracks visually. As collision they are 400 uu walls at
	// every chunk boundary -- invisible geometry a capsule snags on and a camera
	// probe collides with -- so the proxy gets the surface and nothing else.
	const bool bSkirt = !Plan.bCollision && Plan.SkirtDepth > KINDA_SMALL_NUMBER;
	const int32 SkirtCount = bSkirt ? 4 * Quads : 0;
	const int32 VertCount = GridCount + SkirtCount;

	Out.Vertices.SetNumUninitialized(VertCount);
	Out.UVs.SetNumUninitialized(VertCount);
	Out.Normals.SetNumUninitialized(VertCount);
	Out.Colors.SetNumUninitialized(VertCount);

	const FVector2D PatchOrigin = Plan.TileOrigin * 100.0f;
	const float Road2Width = Plan.bHasRoad ? Plan.Road.GetSurfaceHalfWidth() : 0.0f;

	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const int32 I = Y * Edge + X;
			Out.Vertices[I] = FVector(X * VertexSize, Y * VertexSize, PaddedAt(X, Y));
			Out.UVs[I] = FVector2D(static_cast<float>(X * Step), static_cast<float>(Y * Step));

			// Red is road. The material blends the road surface in against it,
			// so the road is these triangles rather than a second set above them.
			float Road = 0.0f;
			if (Plan.bHasRoad)
			{
				const float Wx = PatchOrigin.X + X * VertexSize;
				const float Wy = PatchOrigin.Y + Y * VertexSize;

				// Sampled across the vertex's own cell, not just at the point.
				// A distant patch has vertices further apart than the road is
				// wide, and a road that passes between two of them would be
				// painted onto neither -- so it would fade out with distance
				// while the cutting it sits in stayed.
				const float Reach = VertexSize * 0.4f;
				Road = Plan.Road.SurfaceWeight(Wx, Wy);

				// Only where the vertices are further apart than the road is
				// wide. A near patch samples finely enough that one query per
				// vertex already resolves the road, and these are the patches
				// with the vertices to spare -- paying five queries each there
				// was most of the cost of painting.
				if (VertexSize > Road2Width)
				{
					Road = FMath::Max(Road, Plan.Road.SurfaceWeight(Wx - Reach, Wy));
					Road = FMath::Max(Road, Plan.Road.SurfaceWeight(Wx + Reach, Wy));
					Road = FMath::Max(Road, Plan.Road.SurfaceWeight(Wx, Wy - Reach));
					Road = FMath::Max(Road, Plan.Road.SurfaceWeight(Wx, Wy + Reach));
				}
			}
			Out.Colors[I] = FLinearColor(Road, 0.0f, 0.0f, 1.0f);
		}
	}

	// Central differences over the height grid rather than accumulating face
	// normals: the grid is regular, so the analytic normal is both cheaper and
	// free of the artefacts averaged face normals leave at patch edges.
	const float TwoSamples = 2.0f * VertexSize;
	for (int32 Y = 0; Y < Edge; ++Y)
	{
		for (int32 X = 0; X < Edge; ++X)
		{
			const float DX = (PaddedAt(X + 1, Y) - PaddedAt(X - 1, Y)) / TwoSamples;
			const float DY = (PaddedAt(X, Y + 1) - PaddedAt(X, Y - 1)) / TwoSamples;
			Out.Normals[Y * Edge + X] = FVector(-DX, -DY, 1.0f).GetSafeNormal();
		}
	}

	Out.Triangles.Reserve(Quads * Quads * 6 + SkirtCount * 6);
	for (int32 Y = 0; Y < Quads; ++Y)
	{
		for (int32 X = 0; X < Quads; ++X)
		{
			const int32 I = Y * Edge + X;
			Out.Triangles.Add(I);
			Out.Triangles.Add(I + Edge);
			Out.Triangles.Add(I + Edge + 1);
			Out.Triangles.Add(I);
			Out.Triangles.Add(I + Edge + 1);
			Out.Triangles.Add(I + 1);
		}
	}

	if (bSkirt)
	{
		// One dropped vertex per border edge start, walked as four runs so the
		// wall is continuous around the patch. Each run emits its quad against
		// the next border vertex, which the run's own ordering keeps wound
		// outward.
		int32 Next = GridCount;
		auto AddSkirtRun = [&](TFunctionRef<int32(int32)> BorderIndex, bool bFlip)
		{
			for (int32 K = 0; K < Quads; ++K)
			{
				const int32 A = BorderIndex(K);
				const int32 B = BorderIndex(K + 1);
				const int32 DownA = Next++;
				Out.Vertices[DownA] = Out.Vertices[A] - FVector(0.0f, 0.0f, Plan.SkirtDepth);
				Out.UVs[DownA] = Out.UVs[A];
				Out.Normals[DownA] = Out.Normals[A];
				Out.Colors[DownA] = Out.Colors[A];

				// The second dropped vertex is shared with the next iteration's
				// A only at the run's end, so emit it per quad and let the
				// duplicate cost stand -- it is 4 * Quads vertices, not a mesh.
				const int32 DownB = Next++;
				Out.Vertices[DownB] = Out.Vertices[B] - FVector(0.0f, 0.0f, Plan.SkirtDepth);
				Out.UVs[DownB] = Out.UVs[B];
				Out.Normals[DownB] = Out.Normals[B];
				Out.Colors[DownB] = Out.Colors[B];

				if (bFlip)
				{
					Out.Triangles.Add(A); Out.Triangles.Add(DownB); Out.Triangles.Add(DownA);
					Out.Triangles.Add(A); Out.Triangles.Add(B); Out.Triangles.Add(DownB);
				}
				else
				{
					Out.Triangles.Add(A); Out.Triangles.Add(DownA); Out.Triangles.Add(DownB);
					Out.Triangles.Add(A); Out.Triangles.Add(DownB); Out.Triangles.Add(B);
				}
			}
		};

		// Each run consumes two vertices per quad, so the four runs together
		// need 8 * Quads slots; size the array to match before writing.
		Out.Vertices.SetNumUninitialized(GridCount + 8 * Quads);
		Out.UVs.SetNumUninitialized(GridCount + 8 * Quads);
		Out.Normals.SetNumUninitialized(GridCount + 8 * Quads);
		Out.Colors.SetNumUninitialized(GridCount + 8 * Quads);

		AddSkirtRun([Edge](int32 K) { return K; }, false);                          // Y = 0
		AddSkirtRun([Edge, Quads](int32 K) { return Quads * Edge + K; }, true);     // Y = max
		AddSkirtRun([Edge](int32 K) { return K * Edge; }, true);                    // X = 0
		AddSkirtRun([Edge, Quads](int32 K) { return K * Edge + Quads; }, false);    // X = max
	}

	// The ground material samples by world XY, so the tangent that matches how
	// the normal map is actually being read is world +X projected onto the
	// surface. Leaving tangents empty leaves the normal map with no basis at
	// all, which is what makes lit detail invert as the camera swings around.
	Out.Tangents.SetNumUninitialized(Out.Vertices.Num());
	for (int32 I = 0; I < Out.Vertices.Num(); ++I)
	{
		const FVector& N = Out.Normals[I];
		const FVector Tangent = (FVector::XAxisVector - N * (N | FVector::XAxisVector)).GetSafeNormal();
		Out.Tangents[I] = FProcMeshTangent(Tangent, false);
	}

	Out.GenerateMs += static_cast<float>((FPlatformTime::Seconds() - GenerateStart) * 1000.0);


	Out.GenerateMs += static_cast<float>((FPlatformTime::Seconds() - GenerateStart) * 1000.0);
}
