#include "SKBVEToastLayer.h"

#include "Widgets/SBoxPanel.h"

void SKBVEToastLayer::Construct(const FArguments& InArgs)
{
	MaxToasts       = FMath::Max(1, InArgs._MaxToasts);
	DefaultDuration = InArgs._DefaultDuration;
	ToastWidth      = InArgs._ToastWidth;

	ChildSlot
	[
		SAssignNew(Stack, SVerticalBox)
	];
}

int32 SKBVEToastLayer::PushToast(const FText& Title, const FText& Message, EKBVEToastLevel Level, float Duration)
{
	const float Life = (Duration < 0.f) ? DefaultDuration : Duration;
	const int32 Id   = NextId++;

	while (Entries.Num() >= MaxToasts)
	{
		RemoveEntry(0);
	}

	TSharedRef<SKBVEToast> Toast = SNew(SKBVEToast)
		.Title(Title)
		.Message(Message)
		.Level(Level)
		.Width(ToastWidth)
		.OnDismiss(FSimpleDelegate::CreateSP(this, &SKBVEToastLayer::Dismiss, Id));

	Stack->AddSlot()
	.AutoHeight()
	.Padding(0.f, 0.f, 0.f, 6.f)
	[
		Toast
	];

	FEntry Entry;
	Entry.Id        = Id;
	Entry.Widget    = Toast;
	Entry.Remaining = Life;
	Entry.bExpires  = Life > 0.f;
	Entries.Add(Entry);

	return Id;
}

void SKBVEToastLayer::Dismiss(int32 ToastId)
{
	const int32 Index = Entries.IndexOfByPredicate([ToastId](const FEntry& E) { return E.Id == ToastId; });
	if (Index != INDEX_NONE)
	{
		RemoveEntry(Index);
	}
}

void SKBVEToastLayer::DismissAll()
{
	for (int32 i = Entries.Num() - 1; i >= 0; --i)
	{
		RemoveEntry(i);
	}
}

void SKBVEToastLayer::RemoveEntry(int32 Index)
{
	if (!Entries.IsValidIndex(Index))
	{
		return;
	}
	if (Entries[Index].Widget.IsValid() && Stack.IsValid())
	{
		Stack->RemoveSlot(Entries[Index].Widget.ToSharedRef());
	}
	Entries.RemoveAt(Index);
}

void SKBVEToastLayer::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	for (int32 i = Entries.Num() - 1; i >= 0; --i)
	{
		if (!Entries[i].bExpires)
		{
			continue;
		}
		Entries[i].Remaining -= InDeltaTime;
		if (Entries[i].Remaining <= 0.f)
		{
			RemoveEntry(i);
		}
	}
}
