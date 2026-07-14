#include "KBVEUIStyle.h"

#include "KBVEUITheme.h"
#include "Styling/SlateStyleRegistry.h"
#include "Styling/SlateTypes.h"
#include "Styling/CoreStyle.h"
#include "Brushes/SlateColorBrush.h"
#include "Framework/Application/SlateApplication.h"

TSharedPtr<FSlateStyleSet> FKBVEUIStyle::Instance = nullptr;
TSharedPtr<ISlateStyle> FKBVEUIStyle::OverrideInstance = nullptr;

void FKBVEUIStyle::Initialize()
{
	if (Instance.IsValid())
	{
		return;
	}

	Instance = Create();
	FSlateStyleRegistry::RegisterSlateStyle(*Instance);
}

void FKBVEUIStyle::Shutdown()
{
	ClearOverride();

	if (Instance.IsValid())
	{
		FSlateStyleRegistry::UnRegisterSlateStyle(*Instance);
		Instance.Reset();
	}
}

const ISlateStyle& FKBVEUIStyle::Get()
{
	if (OverrideInstance.IsValid())
	{
		return *OverrideInstance;
	}

	check(Instance.IsValid());
	return *Instance;
}

FName FKBVEUIStyle::GetStyleSetName()
{
	static const FName Name(TEXT("KBVEUIStyle"));
	return Name;
}

void FKBVEUIStyle::RegisterOverride(const TSharedRef<ISlateStyle>& Override)
{
	OverrideInstance = Override;
}

void FKBVEUIStyle::ClearOverride()
{
	OverrideInstance.Reset();
}

const FSlateBrush* FKBVEUIStyle::GetBrush(const FName PropertyName)
{
	return Get().GetBrush(PropertyName);
}

const FButtonStyle& FKBVEUIStyle::GetButtonStyle(const FName PropertyName)
{
	return Get().GetWidgetStyle<FButtonStyle>(PropertyName);
}

const FTextBlockStyle& FKBVEUIStyle::GetTextStyle(const FName PropertyName)
{
	return Get().GetWidgetStyle<FTextBlockStyle>(PropertyName);
}

float FKBVEUIStyle::Scaled(const float Value)
{
	return Value * FSlateApplication::Get().GetApplicationScale();
}

TSharedRef<FSlateStyleSet> FKBVEUIStyle::Create()
{
	using namespace KBVEUI::Theme;

	TSharedRef<FSlateStyleSet> Style = MakeShareable(new FSlateStyleSet(GetStyleSetName()));

	Style->Set("KBVE.Color.PanelBg", FLinearColor(Color::PanelBg));
	Style->Set("KBVE.Color.PanelDeep", FLinearColor(Color::PanelDeep));
	Style->Set("KBVE.Color.PanelBorder", FLinearColor(Color::PanelBorder));
	Style->Set("KBVE.Color.Accent", FLinearColor(Color::Accent));
	Style->Set("KBVE.Color.Danger", FLinearColor(Color::Danger));

	const FSlateColorBrush PanelBrush(Color::PanelBg);
	const FSlateColorBrush PanelDeepBrush(Color::PanelDeep);
	const FSlateColorBrush BorderBrush(Color::PanelBorder);

	Style->Set("KBVE.Brush.Panel", new FSlateColorBrush(PanelBrush));
	Style->Set("KBVE.Brush.PanelDeep", new FSlateColorBrush(PanelDeepBrush));
	Style->Set("KBVE.Brush.Border", new FSlateColorBrush(BorderBrush));

	const FSlateFontInfo BodyFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);
	const FSlateFontInfo HeaderFont = FCoreStyle::GetDefaultFontStyle("Bold", 14);
	const FSlateFontInfo MonoFont = FCoreStyle::GetDefaultFontStyle("Mono", 10);

	const FTextBlockStyle BodyText = FTextBlockStyle()
		.SetFont(BodyFont)
		.SetColorAndOpacity(Color::TextPrimary)
		.SetShadowOffset(FVector2D(0.f, 1.f))
		.SetShadowColorAndOpacity(Color::Shadow);

	const FTextBlockStyle HeaderText = FTextBlockStyle(BodyText)
		.SetFont(HeaderFont)
		.SetColorAndOpacity(Color::TextBright);

	const FTextBlockStyle MutedText = FTextBlockStyle(BodyText)
		.SetColorAndOpacity(Color::TextMuted);

	const FTextBlockStyle MonoText = FTextBlockStyle(BodyText)
		.SetFont(MonoFont);

	Style->Set("KBVE.Text.Body", BodyText);
	Style->Set("KBVE.Text.Header", HeaderText);
	Style->Set("KBVE.Text.Muted", MutedText);
	Style->Set("KBVE.Text.Mono", MonoText);

	const FButtonStyle Button = FButtonStyle()
		.SetNormal(*Style->GetBrush("KBVE.Brush.Panel"))
		.SetHovered(*Style->GetBrush("KBVE.Brush.Border"))
		.SetPressed(*Style->GetBrush("KBVE.Brush.PanelDeep"))
		.SetNormalPadding(FMargin(Metric::Padding, Metric::PaddingTight))
		.SetPressedPadding(FMargin(Metric::Padding, Metric::PaddingTight));

	Style->Set("KBVE.Button.Primary", Button);

	return Style;
}
