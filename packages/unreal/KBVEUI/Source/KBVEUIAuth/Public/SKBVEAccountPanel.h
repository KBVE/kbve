#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/DeclarativeSyntaxSupport.h"
#include "Input/Reply.h"
#include "Styling/SlateBrush.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Text/STextBlock.h"

class UKBVESupabaseSubsystem;
class UTexture2D;
class STextBlock;
class SImage;

class KBVEUIAUTH_API SKBVEAccountPanel : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SKBVEAccountPanel) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UKBVESupabaseSubsystem>, Subsystem)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void SetUsername(const FString& InUsername);
	void SetEmail(const FString& InEmail);
	void SetAvatarURL(const FString& InURL);

private:
	FReply HandleSignOut();
	void   HandleAvatarBytes(const TArray<uint8>& Bytes);

	TWeakObjectPtr<UKBVESupabaseSubsystem> Subsystem;
	TSharedPtr<STextBlock> UsernameText;
	TSharedPtr<SImage>     AvatarImage;
	FSlateBrush            AvatarBrush;

	TObjectPtr<UTexture2D> AvatarTexture;

	FString LastAvatarURL;
};
