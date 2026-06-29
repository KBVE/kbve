#pragma once

#include "CoreMinimal.h"
#include "Styling/SlateStyle.h"
#include "Templates/SharedPointer.h"

class FSlateStyleSet;
struct FSlateBrush;
struct FButtonStyle;
struct FTextBlockStyle;

class KBVEUI_API FKBVEUIStyle
{
public:
	static void Initialize();
	static void Shutdown();

	static const ISlateStyle& Get();
	static FName GetStyleSetName();

	static void RegisterOverride(const TSharedRef<ISlateStyle>& Override);
	static void ClearOverride();

	static const FSlateBrush* GetBrush(const FName PropertyName);
	static const FButtonStyle& GetButtonStyle(const FName PropertyName);
	static const FTextBlockStyle& GetTextStyle(const FName PropertyName);

	static float Scaled(const float Value);

private:
	static TSharedRef<FSlateStyleSet> Create();

	static TSharedPtr<FSlateStyleSet> Instance;
	static TSharedPtr<ISlateStyle> OverrideInstance;
};
