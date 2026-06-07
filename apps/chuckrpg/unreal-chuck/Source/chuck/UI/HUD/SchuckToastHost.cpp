#include "SchuckToastHost.h"

#include "chuckCoreCharacter.h"
#include "chuckEventPayloads.h"
#include "chuckUIEvents.h"
#include "SKBVEToastLayer.h"
#include "Widgets/Layout/SBox.h"

#define LOCTEXT_NAMESPACE "SchuckToastHost"

void SchuckToastHost::Construct(const FArguments& InArgs)
{
	SetCanTick(false);
	SetVisibility(EVisibility::SelfHitTestInvisible);
	Character = InArgs._OwningCharacter;

	ChildSlot
	.HAlign(HAlign_Right)
	.VAlign(VAlign_Top)
	.Padding(FMargin(0.f, 64.f, 16.f, 0.f))
	[
		SAssignNew(ToastLayer, SKBVEToastLayer)
		.MaxToasts(5)
		.DefaultDuration(4.f)
	];

	BindToEventBus();
}

SchuckToastHost::~SchuckToastHost()
{
	AchuckCoreCharacter* C = Character.Get();
	if (UchuckUIEvents* Bus = C ? UchuckUIEvents::Get(C) : nullptr)
	{
		Bus->ItemConsumed.Unsubscribe(ItemConsumedHandle);
		Bus->AuthStatus.Unsubscribe(AuthStatusHandle);
		Bus->AuthError.Unsubscribe(AuthErrorHandle);
	}
}

void SchuckToastHost::BindToEventBus()
{
	AchuckCoreCharacter* C = Character.Get();
	UchuckUIEvents* Bus = C ? UchuckUIEvents::Get(C) : nullptr;
	if (!Bus)
	{
		return;
	}

	ItemConsumedHandle = Bus->ItemConsumed.Subscribe(C, [this](const FchuckItemConsumedPayload& P)
	{
		if (!ToastLayer.IsValid())
		{
			return;
		}
		const FText Msg = (P.HealHP > 0.f)
			? FText::Format(LOCTEXT("ItemHealFmt", "+{0} HP"), FText::AsNumber(FMath::RoundToInt(P.HealHP)))
			: LOCTEXT("ItemUsed", "Item used");
		const FName Key = *FString::Printf(TEXT("item.consumed.%d"), P.ItemKey);
		ToastLayer->PushToastUnique(Key, LOCTEXT("ItemConsumedTitle", "Consumed"), Msg, EKBVEToastLevel::Success);
	});

	AuthStatusHandle = Bus->AuthStatus.Subscribe(C, [this](const FchuckAuthStatusPayload& P)
	{
		if (!ToastLayer.IsValid() || !P.bSignedIn)
		{
			return;
		}
		const FString Name = P.KbveUsername.IsEmpty() ? P.Email : P.KbveUsername;
		const FText Welcome = FText::Format(LOCTEXT("WelcomeBackFmt", "Welcome back {0}"), FText::FromString(Name));
		ToastLayer->PushToastUnique(TEXT("auth.signin"), LOCTEXT("WelcomeTitle", "Signed in"), Welcome, EKBVEToastLevel::Info);
	});

	AuthErrorHandle = Bus->AuthError.Subscribe(C, [this](const FchuckAuthErrorPayload& P)
	{
		if (!ToastLayer.IsValid())
		{
			return;
		}
		const FName Key = P.Code.IsEmpty()
			? FName(TEXT("auth.error"))
			: *FString::Printf(TEXT("auth.error.%s"), *P.Code);
		ToastLayer->PushToastUnique(Key, LOCTEXT("AuthErrTitle", "Auth error"), FText::FromString(P.Message), EKBVEToastLevel::Error);
	});
}

#undef LOCTEXT_NAMESPACE
