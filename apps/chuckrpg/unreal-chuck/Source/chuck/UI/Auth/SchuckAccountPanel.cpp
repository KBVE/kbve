#include "SchuckAccountPanel.h"

#include "KBVESupabaseSubsystem.h"

#include "Engine/Texture2D.h"
#include "HttpModule.h"
#include "ImageUtils.h"
#include "Interfaces/IHttpRequest.h"
#include "Interfaces/IHttpResponse.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBorder.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckAccountPanel"

void SchuckAccountPanel::Construct(const FArguments& InArgs)
{
	Subsystem = InArgs._Subsystem;

	const FSlateFontInfo NickFont   = FCoreStyle::GetDefaultFontStyle("Bold", 13);
	const FSlateFontInfo ButtonFont = FCoreStyle::GetDefaultFontStyle("Regular", 10);

	AvatarBrush.DrawAs = ESlateBrushDrawType::Image;
	AvatarBrush.ImageSize = FVector2D(36.f, 36.f);
	AvatarBrush.TintColor = FSlateColor(FLinearColor(0.15f, 0.18f, 0.24f, 1.f));

	// Self hit-test invisible: only the inner tile (border + button) claim
	// the cursor. Empty viewport area passes through to widgets below
	// (main menu, gameplay HUD).
	SetVisibility(EVisibility::SelfHitTestInvisible);

	ChildSlot
	.HAlign(HAlign_Right)
	.VAlign(VAlign_Top)
	.Padding(FMargin(16.f, 16.f, 16.f, 0.f))
	[
		SNew(SBorder)
		.BorderImage(FCoreStyle::Get().GetBrush("WhiteBrush"))
		.BorderBackgroundColor(FSlateColor(FLinearColor(0.04f, 0.06f, 0.09f, 0.85f)))
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
				.OnClicked(FOnClicked::CreateSP(this, &SchuckAccountPanel::HandleSignOut))
				[
					SNew(STextBlock).Text(LOCTEXT("SignOut", "Sign Out")).Font(ButtonFont)
				]
			]
		]
	];
}

void SchuckAccountPanel::SetUsername(const FString& InUsername)
{
	if (UsernameText.IsValid())
	{
		UsernameText->SetText(InUsername.IsEmpty() ? LOCTEXT("Guest", "Guest") : FText::FromString(InUsername));
	}
}

void SchuckAccountPanel::SetEmail(const FString& /*InEmail*/)
{
	// Email no longer rendered; kept for ABI compatibility with callers.
}

void SchuckAccountPanel::SetAvatarURL(const FString& InURL)
{
	if (InURL.IsEmpty() || InURL == LastAvatarURL) return;
	LastAvatarURL = InURL;

	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Req = FHttpModule::Get().CreateRequest();
	Req->SetURL(InURL);
	Req->SetVerb(TEXT("GET"));
	TWeakPtr<SchuckAccountPanel> WeakSelf = SharedThis(this);
	Req->OnProcessRequestComplete().BindLambda(
		[WeakSelf](FHttpRequestPtr, FHttpResponsePtr Resp, bool bOk)
		{
			TSharedPtr<SchuckAccountPanel> Self = WeakSelf.Pin();
			if (!Self.IsValid() || !bOk || !Resp.IsValid() || Resp->GetResponseCode() < 200 || Resp->GetResponseCode() >= 300) return;
			Self->HandleAvatarBytes(Resp->GetContent());
		});
	Req->ProcessRequest();
}

void SchuckAccountPanel::HandleAvatarBytes(const TArray<uint8>& Bytes)
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

FReply SchuckAccountPanel::HandleSignOut()
{
	if (UKBVESupabaseSubsystem* Sub = Subsystem.Get())
	{
		Sub->SignOut(/*bAlsoRevokeServerSide=*/true);
	}
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
