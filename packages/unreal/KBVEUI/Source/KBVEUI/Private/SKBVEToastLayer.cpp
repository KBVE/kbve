#include "SKBVEToastLayer.h"

#include "Widgets/SBoxPanel.h"

void SKBVEToastLayer::Construct(const FArguments& InArgs)
{
	MaxToasts       = FMath::Max(1, InArgs._MaxToasts);
	DefaultDuration = InArgs._DefaultDuration;
	ToastWidth      = InArgs._ToastWidth;
	StaggerInterval = FMath::Max(0.f, InArgs._StaggerInterval);

	ChildSlot
	[
		SAssignNew(Stack, SVerticalBox)
	];
}

int32 SKBVEToastLayer::PushToast(const FText& Title, const FText& Message, EKBVEToastLevel Level, float Duration)
{
	return PushToastUnique(NAME_None, Title, Message, Level, Duration);
}

int32 SKBVEToastLayer::PushToastUnique(FName DedupeKey, const FText& Title, const FText& Message, EKBVEToastLevel Level, float Duration)
{
	const float Life = (Duration < 0.f) ? DefaultDuration : Duration;

	if (!DedupeKey.IsNone())
	{
		const int32 LiveIdx = Entries.IndexOfByPredicate([DedupeKey](const FEntry& E)
		{
			return E.DedupeKey == DedupeKey && !E.bExiting;
		});
		if (LiveIdx != INDEX_NONE)
		{
			Entries[LiveIdx].Remaining = Life;
			Entries[LiveIdx].bExpires  = Life > 0.f;
			return Entries[LiveIdx].Id;
		}
		const int32 PendingIdx = Pending.IndexOfByPredicate([DedupeKey](const FPending& P)
		{
			return P.DedupeKey == DedupeKey;
		});
		if (PendingIdx != INDEX_NONE)
		{
			Pending[PendingIdx].Title   = Title;
			Pending[PendingIdx].Message = Message;
			Pending[PendingIdx].Level   = Level;
			Pending[PendingIdx].Life    = Life;
			return Pending[PendingIdx].Id;
		}
	}

	FPending P;
	P.Id        = NextId++;
	P.DedupeKey = DedupeKey;
	P.Title     = Title;
	P.Message   = Message;
	P.Level     = Level;
	P.Life      = Life;
	Pending.Add(P);
	return P.Id;
}

void SKBVEToastLayer::Dismiss(int32 ToastId)
{
	const int32 PendingIdx = Pending.IndexOfByPredicate([ToastId](const FPending& P) { return P.Id == ToastId; });
	if (PendingIdx != INDEX_NONE)
	{
		Pending.RemoveAt(PendingIdx);
		return;
	}
	const int32 Index = Entries.IndexOfByPredicate([ToastId](const FEntry& E) { return E.Id == ToastId; });
	if (Index != INDEX_NONE)
	{
		BeginExit(Index, ExitAnimDuration);
	}
}

void SKBVEToastLayer::DismissAll()
{
	Pending.Reset();
	for (int32 i = 0; i < Entries.Num(); ++i)
	{
		BeginExit(i, ExitAnimDuration);
	}
}

void SKBVEToastLayer::BeginExit(int32 Index, float Duration)
{
	if (!Entries.IsValidIndex(Index) || Entries[Index].bExiting) return;
	Entries[Index].bExiting  = true;
	Entries[Index].bExpires  = true;
	Entries[Index].Remaining = Duration;
	if (Entries[Index].Toast.IsValid())
	{
		Entries[Index].Toast->BeginExit(Duration);
	}
}

void SKBVEToastLayer::HardRemoveEntry(int32 Index)
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

void SKBVEToastLayer::SpawnFromPending(const FPending& P)
{
	int32 LiveCount = 0;
	for (const FEntry& E : Entries) if (!E.bExiting) ++LiveCount;
	if (LiveCount >= MaxToasts)
	{
		for (int32 i = 0; i < Entries.Num(); ++i)
		{
			if (!Entries[i].bExiting)
			{
				BeginExit(i, ExitAnimDuration);
				break;
			}
		}
	}

	TSharedRef<SKBVEToast> Toast = SNew(SKBVEToast)
		.Title(P.Title)
		.Message(P.Message)
		.Level(P.Level)
		.Width(ToastWidth)
		.OnDismiss(FSimpleDelegate::CreateSP(this, &SKBVEToastLayer::Dismiss, P.Id));

	Stack->AddSlot()
	.AutoHeight()
	.Padding(0.f, 0.f, 0.f, 6.f)
	[
		Toast
	];

	FEntry Entry;
	Entry.Id        = P.Id;
	Entry.DedupeKey = P.DedupeKey;
	Entry.Toast     = Toast;
	Entry.Widget    = Toast;
	Entry.Remaining = P.Life;
	Entry.bExpires  = P.Life > 0.f;
	Entries.Add(Entry);
}

void SKBVEToastLayer::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);

	if (Pending.Num() > 0)
	{
		StaggerTime += InDeltaTime;
		while (Pending.Num() > 0 && StaggerTime >= StaggerInterval)
		{
			const FPending Next = Pending[0];
			Pending.RemoveAt(0);
			SpawnFromPending(Next);
			StaggerTime -= StaggerInterval;
		}
	}
	else
	{
		StaggerTime = StaggerInterval;
	}

	for (int32 i = Entries.Num() - 1; i >= 0; --i)
	{
		FEntry& E = Entries[i];
		if (!E.bExpires)
		{
			continue;
		}
		E.Remaining -= InDeltaTime;
		if (E.bExiting)
		{
			if (E.Remaining <= 0.f)
			{
				HardRemoveEntry(i);
			}
		}
		else if (E.Remaining <= 0.f)
		{
			BeginExit(i, ExitAnimDuration);
		}
	}
}
