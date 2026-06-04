#include "ChuckUIStyle.h"

#include "Misc/Paths.h"
#include "Styling/CoreStyle.h"
#include "Styling/SlateStyleRegistry.h"

TSharedPtr<FSlateStyleSet> FChuckUIStyle::StyleInstance = nullptr;

const FName FChuckUIStyle::FKeys::Design_Width            = TEXT("Chuck.Design.Width");
const FName FChuckUIStyle::FKeys::Design_Height           = TEXT("Chuck.Design.Height");
const FName FChuckUIStyle::FKeys::MainMenu_Title_Font     = TEXT("Chuck.MainMenu.Title.Font");
const FName FChuckUIStyle::FKeys::MainMenu_Title_Padding  = TEXT("Chuck.MainMenu.Title.Padding");
const FName FChuckUIStyle::FKeys::MainMenu_Column_Width   = TEXT("Chuck.MainMenu.Column.Width");
const FName FChuckUIStyle::FKeys::Button_Font             = TEXT("Chuck.Button.Font");
const FName FChuckUIStyle::FKeys::Button_SlotPadding      = TEXT("Chuck.Button.SlotPadding");
const FName FChuckUIStyle::FKeys::Button_ContentPadding   = TEXT("Chuck.Button.ContentPadding");

const FName FChuckUIStyle::FKeys::HUD_Padding             = TEXT("Chuck.HUD.Padding");
const FName FChuckUIStyle::FKeys::HUD_Bar_Width           = TEXT("Chuck.HUD.Bar.Width");
const FName FChuckUIStyle::FKeys::HUD_Bar_Height          = TEXT("Chuck.HUD.Bar.Height");
const FName FChuckUIStyle::FKeys::HUD_Bar_Spacing         = TEXT("Chuck.HUD.Bar.Spacing");
const FName FChuckUIStyle::FKeys::HUD_Label_Font          = TEXT("Chuck.HUD.Label.Font");
const FName FChuckUIStyle::FKeys::HUD_Health_Color        = TEXT("Chuck.HUD.HealthColor");
const FName FChuckUIStyle::FKeys::HUD_Mana_Color          = TEXT("Chuck.HUD.ManaColor");
const FName FChuckUIStyle::FKeys::HUD_Stamina_Color       = TEXT("Chuck.HUD.StaminaColor");
const FName FChuckUIStyle::FKeys::HUD_Bar_Background_Color= TEXT("Chuck.HUD.Bar.BackgroundColor");

void FChuckUIStyle::Initialize()
{
	if (StyleInstance.IsValid())
	{
		return;
	}
	StyleInstance = Create();
	FSlateStyleRegistry::RegisterSlateStyle(*StyleInstance);
}

void FChuckUIStyle::Shutdown()
{
	if (!StyleInstance.IsValid())
	{
		return;
	}
	FSlateStyleRegistry::UnRegisterSlateStyle(*StyleInstance);
	StyleInstance.Reset();
}

const ISlateStyle& FChuckUIStyle::Get()
{
	check(StyleInstance.IsValid());
	return *StyleInstance;
}

FName FChuckUIStyle::GetStyleSetName()
{
	static const FName Name(TEXT("ChuckUI"));
	return Name;
}

TSharedRef<FSlateStyleSet> FChuckUIStyle::Create()
{
	TSharedRef<FSlateStyleSet> Style = MakeShared<FSlateStyleSet>(GetStyleSetName());
	Style->SetContentRoot(FPaths::ProjectContentDir() / TEXT("UI"));

	Style->Set(FKeys::Design_Width,  1920.f);
	Style->Set(FKeys::Design_Height, 1080.f);

	Style->Set(FKeys::MainMenu_Title_Font,    FCoreStyle::GetDefaultFontStyle("Bold", 64));
	Style->Set(FKeys::MainMenu_Title_Padding, FMargin(0.f, 0.f, 0.f, 48.f));
	Style->Set(FKeys::MainMenu_Column_Width,  480.f);

	Style->Set(FKeys::Button_Font,            FCoreStyle::GetDefaultFontStyle("Regular", 28));
	Style->Set(FKeys::Button_SlotPadding,     FMargin(0.f, 0.f, 0.f, 16.f));
	Style->Set(FKeys::Button_ContentPadding,  FMargin(32.f, 14.f));

	Style->Set(FKeys::HUD_Padding,            FMargin(32.f, 32.f, 32.f, 32.f));
	Style->Set(FKeys::HUD_Bar_Width,          280.f);
	Style->Set(FKeys::HUD_Bar_Height,         18.f);
	Style->Set(FKeys::HUD_Bar_Spacing,        6.f);
	Style->Set(FKeys::HUD_Label_Font,         FCoreStyle::GetDefaultFontStyle("Regular", 14));
	Style->Set(FKeys::HUD_Health_Color,       FLinearColor(0.85f, 0.18f, 0.20f, 1.f));
	Style->Set(FKeys::HUD_Mana_Color,         FLinearColor(0.20f, 0.40f, 0.95f, 1.f));
	Style->Set(FKeys::HUD_Stamina_Color,      FLinearColor(0.90f, 0.78f, 0.18f, 1.f));
	Style->Set(FKeys::HUD_Bar_Background_Color, FLinearColor(0.06f, 0.06f, 0.06f, 0.85f));

	return Style;
}
