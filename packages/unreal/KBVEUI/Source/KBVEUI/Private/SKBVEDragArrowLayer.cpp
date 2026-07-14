#include "SKBVEDragArrowLayer.h"

#include "FKBVEDragOp.h"
#include "Framework/Application/SlateApplication.h"
#include "Rendering/DrawElements.h"

void SKBVEDragArrowLayer::Construct(const FArguments& InArgs)
{
	Color      = InArgs._Color;
	DashLength = InArgs._DashLength;
	GapLength  = InArgs._GapLength;
	Thickness  = InArgs._Thickness;
	SetCanTick(true);
	SetVisibility(EVisibility::HitTestInvisible);
}

void SKBVEDragArrowLayer::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SLeafWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	bActive = false;
	bHasTarget = false;
	PhaseSeconds = InCurrentTime;

	if (!FSlateApplication::IsInitialized()) return;
	FSlateApplication& App = FSlateApplication::Get();
	if (!App.IsDragDropping()) return;

	TSharedPtr<FDragDropOperation> Raw = App.GetDragDroppingContent();
	if (!Raw.IsValid() || !Raw->IsOfType<FKBVEDragOp>()) return;
	TSharedPtr<FKBVEDragOp> Op = StaticCastSharedPtr<FKBVEDragOp>(Raw);

	TSharedPtr<SWidget> Src = Op->SourceWidget.Pin();
	if (!Src.IsValid()) return;

	const FGeometry& SrcGeo = Src->GetCachedGeometry();
	const FVector2D SrcCenterAbs = SrcGeo.LocalToAbsolute(SrcGeo.GetLocalSize() * 0.5f);
	SourceAbs = AllottedGeometry.AbsoluteToLocal(SrcCenterAbs);

	if (TSharedPtr<SWidget> Tgt = Op->HoverWidget.Pin())
	{
		const FGeometry& TgtGeo = Tgt->GetCachedGeometry();
		const FVector2D TgtCenterAbs = TgtGeo.LocalToAbsolute(TgtGeo.GetLocalSize() * 0.5f);
		TargetAbs = AllottedGeometry.AbsoluteToLocal(TgtCenterAbs);
		bHasTarget = true;
	}
	else
	{
		const FVector2D Cursor = App.GetCursorPos();
		TargetAbs = AllottedGeometry.AbsoluteToLocal(Cursor);
	}

	bActive = true;
}

namespace
{
	FVector2D Bezier(const FVector2D& A, const FVector2D& C, const FVector2D& B, float T)
	{
		const float U = 1.f - T;
		return U * U * A + 2.f * U * T * C + T * T * B;
	}

	void DrawDashedBezier(
		FSlateWindowElementList& Out,
		int32 LayerId,
		const FPaintGeometry& Pg,
		const FVector2D& A,
		const FVector2D& B,
		float CurveOffset,
		float DashLen,
		float GapLen,
		float PhaseOffset,
		const FLinearColor& Color,
		float Thickness)
	{
		const FVector2D Mid = (A + B) * 0.5f;
		const FVector2D Dir = (B - A);
		const float Len = Dir.Size();
		if (Len < 1.f) return;
		const FVector2D N(-Dir.Y / Len, Dir.X / Len);
		const FVector2D Ctrl = Mid + N * CurveOffset;

		constexpr int32 Steps = 48;
		TArray<FVector2D> Pts;
		Pts.Reserve(Steps + 1);
		for (int32 i = 0; i <= Steps; ++i)
		{
			const float T = static_cast<float>(i) / static_cast<float>(Steps);
			Pts.Add(Bezier(A, Ctrl, B, T));
		}

		float Accum = -PhaseOffset;
		bool bInDash = true;
		TArray<FVector2D> Segment;
		auto Flush = [&]()
		{
			if (Segment.Num() >= 2)
			{
				FSlateDrawElement::MakeLines(Out, LayerId, Pg, Segment, ESlateDrawEffect::None, Color, true, Thickness);
			}
			Segment.Reset();
		};

		Segment.Add(Pts[0]);
		for (int32 i = 1; i < Pts.Num(); ++i)
		{
			const FVector2D Step = Pts[i] - Pts[i - 1];
			const float StepLen = Step.Size();
			Accum += StepLen;
			const float Period = DashLen + GapLen;
			const float Mod = FMath::Fmod(Accum < 0.f ? Accum + Period * 1000.f : Accum, Period);
			const bool bNowInDash = Mod < DashLen;
			if (bNowInDash != bInDash)
			{
				if (bInDash) Flush();
				bInDash = bNowInDash;
				if (bInDash) Segment.Add(Pts[i]);
			}
			else if (bInDash)
			{
				Segment.Add(Pts[i]);
			}
		}
		Flush();

		const FVector2D TipA = Bezier(A, Ctrl, B, 0.92f);
		const FVector2D TipDir = (B - TipA).GetSafeNormal();
		if (!TipDir.IsNearlyZero())
		{
			const FVector2D Side(-TipDir.Y, TipDir.X);
			const float HeadSize = 9.f;
			TArray<FVector2D> Head1 = { B, B - TipDir * HeadSize + Side * HeadSize * 0.55f };
			TArray<FVector2D> Head2 = { B, B - TipDir * HeadSize - Side * HeadSize * 0.55f };
			FSlateDrawElement::MakeLines(Out, LayerId, Pg, Head1, ESlateDrawEffect::None, Color, true, Thickness + 0.5f);
			FSlateDrawElement::MakeLines(Out, LayerId, Pg, Head2, ESlateDrawEffect::None, Color, true, Thickness + 0.5f);
		}
	}
}

int32 SKBVEDragArrowLayer::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	if (!bActive) return LayerId;

	const FPaintGeometry Pg = AllottedGeometry.ToPaintGeometry();
	const float PhasePx = static_cast<float>(FMath::Fmod(PhaseSeconds * 30.0, static_cast<double>(DashLength + GapLength)));

	const FVector2D Delta = TargetAbs - SourceAbs;
	const float Dist = Delta.Size();
	const float Curve = FMath::Clamp(Dist * 0.28f, 24.f, 90.f);

	DrawDashedBezier(OutDrawElements, LayerId + 1, Pg, SourceAbs, TargetAbs, +Curve, DashLength, GapLength, PhasePx, Color, Thickness);
	if (bHasTarget)
	{
		const FLinearColor Cool(0.45f, 0.85f, 1.f, 0.85f);
		DrawDashedBezier(OutDrawElements, LayerId + 1, Pg, TargetAbs, SourceAbs, +Curve, DashLength, GapLength, PhasePx, Cool, Thickness);
	}

	return LayerId + 2;
}
