#include "chuckHUDRenderer.h"

#include "Framework/Application/SlateApplication.h"
#include "Rendering/SlateRenderer.h"
#include "Styling/CoreStyle.h"

namespace chuckHUDRenderer
{
	static void DrawSolidQuad(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		const FLinearColor& Color)
	{
		FSlateDrawElement::MakeBox(
			Out,
			LayerId,
			Geometry.ToPaintGeometry(Size, FSlateLayoutTransform(Pos)),
			FCoreStyle::Get().GetBrush("WhiteBrush"),
			ESlateDrawEffect::None,
			Color);
	}

	void DrawBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor)
	{
		const float Clamped = FMath::Clamp(Percent, 0.f, 1.f);

		DrawSolidQuad(Out, Geometry, LayerId,     Pos, Size, BackgroundColor);
		DrawSolidQuad(Out, Geometry, LayerId + 1, Pos, FVector2D(Size.X * Clamped, Size.Y), FillColor);
	}

	void DrawSlantedBar(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FVector2D& Size,
		float Slant,
		float Percent,
		const FLinearColor& FillColor,
		const FLinearColor& BackgroundColor)
	{
		const float Clamped = FMath::Clamp(Percent, 0.f, 1.f);
		const float FillWidth = Size.X * Clamped;

		auto MakeQuad = [&](float Left, float Right, float QuadSlant, int32 Layer, const FLinearColor& Color)
		{
			TArray<FSlateVertex> Vertices;
			Vertices.Reserve(4);

			const FVector2D P0 = Pos + FVector2D(Left  + QuadSlant, 0.f);
			const FVector2D P1 = Pos + FVector2D(Right,             0.f);
			const FVector2D P2 = Pos + FVector2D(Right - QuadSlant, Size.Y);
			const FVector2D P3 = Pos + FVector2D(Left,              Size.Y);

			const FColor Packed = Color.ToFColor(true);

			auto AddVertex = [&](const FVector2D& Local)
			{
				FSlateVertex V;
				V.Position = FVector2f(Geometry.LocalToAbsolute(Local));
				V.Color = Packed;
				V.TexCoords[0] = 0.f;
				V.TexCoords[1] = 0.f;
				V.TexCoords[2] = 1.f;
				V.TexCoords[3] = 1.f;
				V.MaterialTexCoords = FVector2f::ZeroVector;
				Vertices.Add(V);
			};
			AddVertex(P0);
			AddVertex(P1);
			AddVertex(P2);
			AddVertex(P3);

			TArray<SlateIndex> Indices = { 0, 1, 2, 0, 2, 3 };

			const FSlateBrush* WhiteBrush = FCoreStyle::Get().GetBrush("WhiteBrush");
			FSlateResourceHandle Handle = FSlateApplication::Get().GetRenderer()->GetResourceHandle(*WhiteBrush);

			FSlateDrawElement::MakeCustomVerts(
				Out,
				Layer,
				Handle,
				Vertices,
				Indices,
				nullptr,
				0,
				0);
		};

		MakeQuad(0.f, Size.X,    Slant,                                    LayerId,     BackgroundColor);
		if (FillWidth > 0.5f)
		{
			const float FillSlant = FMath::Min(Slant, FillWidth * 0.5f);
			MakeQuad(0.f, FillWidth, FillSlant, LayerId + 1, FillColor);
		}
	}

	void DrawText(
		FSlateWindowElementList& Out,
		const FGeometry& Geometry,
		int32 LayerId,
		const FVector2D& Pos,
		const FString& Text,
		const FSlateFontInfo& Font,
		const FLinearColor& Color)
	{
		FSlateDrawElement::MakeText(
			Out,
			LayerId,
			Geometry.ToPaintGeometry(FVector2D(512.f, Font.Size + 4.f), FSlateLayoutTransform(Pos)),
			Text,
			Font,
			ESlateDrawEffect::None,
			Color);
	}
}
