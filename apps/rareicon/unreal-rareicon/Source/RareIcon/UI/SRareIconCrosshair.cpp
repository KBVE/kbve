#include "SRareIconCrosshair.h"

#include "KBVEUITheme.h"
#include "Rendering/DrawElements.h"

void SRareIconCrosshair::Construct(const FArguments& InArgs)
{
	Gap = InArgs._Gap;
	Length = InArgs._Length;
	Thickness = InArgs._Thickness;

	// Nothing under the mouse: the crosshair sits in the middle of the screen
	// and would otherwise eat the click that fires the weapon.
	SetVisibility(EVisibility::HitTestInvisible);
}

FVector2D SRareIconCrosshair::ComputeDesiredSize(float) const
{
	const float Extent = 2.f * (Gap + Length);
	return FVector2D(Extent, Extent);
}

int32 SRareIconCrosshair::OnPaint(
	const FPaintArgs& Args,
	const FGeometry& AllottedGeometry,
	const FSlateRect& MyCullingRect,
	FSlateWindowElementList& OutDrawElements,
	int32 LayerId,
	const FWidgetStyle& InWidgetStyle,
	bool bParentEnabled) const
{
	const FVector2D Size = AllottedGeometry.GetLocalSize();
	const FVector2D Mid = Size * 0.5f;

	// A dark pass under a bright one, offset by a pixel. The mark is read
	// against whatever the world happens to put behind it -- sky, snow, a wall
	// lit by the sun -- and a single-colour crosshair disappears into half of
	// them.
	const FLinearColor Shade = KBVEUI::Theme::Color::Shadow;
	const FLinearColor Ink = KBVEUI::Theme::Color::TextBright;

	auto Arm = [&](const FVector2D& Dir, const FLinearColor& Colour, const FVector2D& Offset)
	{
		TArray<FVector2D> Points;
		Points.Add(Mid + Dir * Gap + Offset);
		Points.Add(Mid + Dir * (Gap + Length) + Offset);
		FSlateDrawElement::MakeLines(
			OutDrawElements, LayerId, AllottedGeometry.ToPaintGeometry(), Points,
			ESlateDrawEffect::None, Colour, true, Thickness);
	};

	const FVector2D Dirs[] = {
		FVector2D(0.f, -1.f), FVector2D(0.f, 1.f),
		FVector2D(-1.f, 0.f), FVector2D(1.f, 0.f)
	};

	for (const FVector2D& Dir : Dirs)
	{
		Arm(Dir, Shade, FVector2D(1.f, 1.f));
	}
	for (const FVector2D& Dir : Dirs)
	{
		Arm(Dir, Ink, FVector2D::ZeroVector);
	}

	// The centre dot, drawn as a very short line so it needs no brush either.
	TArray<FVector2D> Dot;
	Dot.Add(Mid - FVector2D(0.5f, 0.f));
	Dot.Add(Mid + FVector2D(0.5f, 0.f));
	FSlateDrawElement::MakeLines(
		OutDrawElements, LayerId + 1, AllottedGeometry.ToPaintGeometry(), Dot,
		ESlateDrawEffect::None, KBVEUI::Theme::Color::Accent, true, Thickness);

	return LayerId + 2;
}
