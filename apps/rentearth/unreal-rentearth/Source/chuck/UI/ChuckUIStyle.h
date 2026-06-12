#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateStyle.h"

class FChuckUIStyle
{
public:
	static void Initialize();
	static void Shutdown();
	static const ISlateStyle& Get();
	static FName GetStyleSetName();

	struct FKeys
	{
		static const FName Design_Width;
		static const FName Design_Height;

		static const FName MainMenu_Title_Font;
		static const FName MainMenu_Title_Padding;
		static const FName MainMenu_Column_Width;

		static const FName Button_Font;
		static const FName Button_SlotPadding;
		static const FName Button_ContentPadding;

		static const FName HUD_Padding;
		static const FName HUD_Bar_Width;
		static const FName HUD_Bar_Height;
		static const FName HUD_Bar_Spacing;
		static const FName HUD_Label_Font;
		static const FName HUD_Health_Color;
		static const FName HUD_Mana_Color;
		static const FName HUD_Stamina_Color;
		static const FName HUD_Bar_Background_Color;
	};

private:
	static TSharedRef<FSlateStyleSet> Create();
	static TSharedPtr<FSlateStyleSet> StyleInstance;
};
