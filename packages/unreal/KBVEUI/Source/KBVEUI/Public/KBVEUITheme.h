#pragma once

#include "CoreMinimal.h"

namespace KBVEUI::Theme
{
	namespace Color
	{
		inline const FLinearColor PanelDeep   = FLinearColor(0.063f, 0.055f, 0.043f, 0.92f);
		inline const FLinearColor PanelBg     = FLinearColor(0.165f, 0.141f, 0.106f, 0.95f);
		inline const FLinearColor PanelBorder = FLinearColor(0.239f, 0.180f, 0.118f, 1.f);

		inline const FLinearColor TextBright   = FLinearColor(0.910f, 0.863f, 0.784f, 1.f);
		inline const FLinearColor TextPrimary  = FLinearColor(0.769f, 0.722f, 0.620f, 1.f);
		inline const FLinearColor TextMuted    = FLinearColor(0.620f, 0.580f, 0.502f, 1.f);
		inline const FLinearColor TextDisabled = FLinearColor(0.420f, 0.388f, 0.337f, 1.f);

		inline const FLinearColor Accent       = FLinearColor(0.831f, 0.643f, 0.298f, 1.f);
		inline const FLinearColor AccentDim    = FLinearColor(0.722f, 0.537f, 0.239f, 1.f);
		inline const FLinearColor AccentStrong = FLinearColor(0.910f, 0.753f, 0.416f, 1.f);
		inline const FLinearColor Danger       = FLinearColor(0.769f, 0.251f, 0.251f, 1.f);
		inline const FLinearColor Warning      = FLinearColor(0.784f, 0.522f, 0.290f, 1.f);
		inline const FLinearColor Forest       = FLinearColor(0.106f, 0.227f, 0.165f, 1.f);
		inline const FLinearColor Highlight    = FLinearColor(0.667f, 0.541f, 0.729f, 1.f);

		inline const FLinearColor Leather      = FLinearColor(0.239f, 0.180f, 0.118f, 1.f);
		inline const FLinearColor Black        = FLinearColor(0.f, 0.f, 0.f, 1.f);
		inline const FLinearColor Shadow       = FLinearColor(0.f, 0.f, 0.f, 0.65f);
	}

	namespace Metric
	{
		inline constexpr float PaddingTight  = 4.f;
		inline constexpr float Padding       = 8.f;
		inline constexpr float PaddingLoose  = 12.f;
		inline constexpr float CornerRadius  = 4.f;
		inline constexpr float BorderWidth   = 1.f;
	}
}
