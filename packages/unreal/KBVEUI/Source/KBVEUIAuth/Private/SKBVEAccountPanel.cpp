#include "SKBVEAccountPanel.h"

#include "KBVESupabaseSubsystem.h"

#include "Engine/Texture2D.h"
#include "HttpModule.h"
#include "ImageUtils.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"
#include "KBVEUITheme.h"

#define LOCTEXT_NAMESPACE "SKBVEAccountPanel"

void SKBVEAccountPanel::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	Subsystem = InArgs._Subsystem;

	const FSlateFontInfo NickFont   = FCoreStyle::GetDefaultFontStyle("Bold", 13);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	AvatarBrush.DrawAs = ESlateBrushDrawType::Image;
	AvatarBrush.ImageSize = FVector2D(36.f, 36.f);
	AvatarBrush.TintColor = FSlateColor(KBVEUI::Theme::Color::PanelBg.CopyWithNewOpacity(1.f));

	SetVisibility(EVisibility::SelfHitTestInvisible);

	ChildSlot
	.HAlign(HAlign_Right)
	.VAlign(VAlign_Top)
	.Padding(FMargin(16.f, 16.f, 16.f, 0.f))
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FSlateColor(KBVEUI::Theme::Color::PanelDeep.CopyWithNewOpacity(0.85f)))
		.Padding(FMargin(10.f, 6.f))
		[
			SNew(SHorizontalBox)
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 10.f, 0.f)
			[
				SNew(SBox).WidthOverride(36.f).HeightOverride(36.f)
				[
					SAssignNew(AvatarImage, SImage).Image(&AvatarBrush)
				]
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center).Padding(0.f, 0.f, 10.f, 0.f)
			[
				SAssignNew(UsernameText, STextBlock).Text(LOCTEXT("Unknown", "—")).Font(NickFont)
			]
			+ SHorizontalBox::Slot().AutoWidth().VAlign(VAlign_Center)
			[
				SNew(SButton)
				.HAlign(HAlign_Center).VAlign(VAlign_Center)
				.OnClicked(FOnClicked::CreateSP(this, &SKBVEAccountPanel::HandleSignOut))
				[
					SNew(STextBlock).Text(LOCTEXT("SignOut", "Sign Out")).Font(ButtonFont)
				]
			]
		]
	];
}

void SKBVEAccountPanel::SetUsername(const FString& InUsername)
{
	if (UsernameText.IsValid())
	{
		UsernameText->SetText(InUsername.IsEmpty() ? LOCTEXT("Guest", "Guest") : FText::FromString(InUsername));
	}
}

void SKBVEAccountPanel::SetEmail(const FString& /*InEmail*/)
{
}

void SKBVEAccountPanel::SetAvatarURL(const FString& InURL)
{
	if (InURL.IsEmpty() || InURL == LastAvatarURL) return;
	LastAvatarURL = InURL;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(InURL);
	Req->SetVerb(TEXT("GET"));
	TWeakPtr<SKBVEAccountPanel> WeakSelf = SharedThis(this);
	Req->OnProcessRequestComplete().BindLambda(
		[WeakSelf](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			TSharedPtr<SKBVEAccountPanel> Self = WeakSelf.Pin();
			if (!Self.IsValid() || !bOk || !Resp.IsValid() || Resp->GetResponseCode() < 200 || Resp->GetResponseCode() >= 300) return;
			Self->HandleAvatarBytes(Resp->GetContent());
		});
	Req->ProcessRequest();
}

void SKBVEAccountPanel::HandleAvatarBytes(const TArray<uint8>& Bytes)
{
	if (Bytes.Num() == 0) return;
	UTexture2D* NewTex = FImageUtils::ImportBufferAsTexture2D(Bytes);
	if (!NewTex) return;
	NewTex->AddToRoot();
	AvatarTexture = NewTex;
	AvatarBrush.SetResourceObject(NewTex);
	AvatarBrush.ImageSize = FVector2D(NewTex->GetSizeX(), NewTex->GetSizeY());
	AvatarBrush.TintColor = FSlateColor(FLinearColor::White);
	if (AvatarImage.IsValid())
	{
		AvatarImage->Invalidate(EInvalidateWidgetReason::Paint | EInvalidateWidgetReason::Layout);
	}
}

FReply SKBVEAccountPanel::HandleSignOut()
{
	if (UKBVESupabaseSubsystem* Sub = Subsystem.Get())
	{
		Sub->SignOut(/*bAlsoRevokeServerSide=*/true);
	}
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
