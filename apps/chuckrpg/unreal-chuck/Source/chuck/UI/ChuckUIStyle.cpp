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

	return Style;
}
