#include "KBVEWorldInstanceSlots.h"

#include "Misc/AutomationTest.h"

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
	/**
	 * What a component driven by these decisions would be holding.
	 *
	 * The slots decide where each transform goes and what is parked; standing in
	 * for the component is what shows the two agree. A parked slot is remembered
	 * as empty rather than dropped, because that is what parking is.
	 */
	struct FStandIn
	{
		TArray<FString> Slot;

		void Apply(const TArray<int32>& Slots, const TArray<int32>& Parked, const FString& Owner)
		{
			for (const int32 At : Parked)
			{
				Slot[At] = FString();
			}

			for (int32 I = 0; I < Slots.Num(); ++I)
			{
				const int32 At = Slots[I];
				while (Slot.Num() <= At)
				{
					Slot.AddDefaulted();
				}
				Slot[At] = FString::Printf(TEXT("%s:%d"), *Owner, I);
			}
		}

		int32 Live() const
		{
			int32 Count = 0;
			for (const FString& At : Slot)
			{
				Count += At.IsEmpty() ? 0 : 1;
			}
			return Count;
		}
	};
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsKeepsAKeyStill,
	"KBVE.World.InstanceSlots.KeepsAKeyStillWhenItsCountHasNotChanged",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsKeepsAKeyStill::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	TArray<int32> Given, Parked;

	Slots.Assign(FIntPoint(0, 0), 4, Given, Parked);
	const TArray<int32> First = Given;

	Slots.Assign(FIntPoint(0, 0), 4, Given, Parked);

	TestEqual(TEXT("the same slots come back"), Given, First);
	TestEqual(TEXT("nothing was parked"), Parked.Num(), 0);
	TestEqual(TEXT("nothing new was handed out"), Slots.Total(), 4);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsNeverMovesAnotherKey,
	"KBVE.World.InstanceSlots.NeverMovesWhatAnotherKeyHolds",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsNeverMovesAnotherKey::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	FStandIn Stand;
	TArray<int32> Given, Parked;

	// Three chunks in, the middle one out. The engine's own removal would swap
	// the last instance into the hole and quietly renumber a neighbour; this is
	// the whole reason the pool parks instead.
	Slots.Assign(FIntPoint(0, 0), 3, Given, Parked);
	Stand.Apply(Given, Parked, TEXT("A"));
	Slots.Assign(FIntPoint(1, 0), 3, Given, Parked);
	Stand.Apply(Given, Parked, TEXT("B"));
	Slots.Assign(FIntPoint(2, 0), 3, Given, Parked);
	Stand.Apply(Given, Parked, TEXT("C"));

	const TArray<FString> Before = Stand.Slot;

	Slots.Drop(FIntPoint(1, 0), Parked);
	Stand.Apply(TArray<int32>(), Parked, FString());

	for (int32 At = 0; At < Before.Num(); ++At)
	{
		if (Before[At].StartsWith(TEXT("B")))
		{
			TestTrue(TEXT("the dropped key's slot is parked"), Stand.Slot[At].IsEmpty());
		}
		else
		{
			TestEqual(TEXT("every other slot is untouched"), Stand.Slot[At], Before[At]);
		}
	}

	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsReusesWhatWasParked,
	"KBVE.World.InstanceSlots.ReusesWhatWasParkedRatherThanGrowing",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsReusesWhatWasParked::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	TArray<int32> Given, Parked;

	Slots.Assign(FIntPoint(0, 0), 5, Given, Parked);
	Slots.Drop(FIntPoint(0, 0), Parked);

	TestEqual(TEXT("five are parked"), Slots.Parked(), 5);

	Slots.Assign(FIntPoint(9, 9), 5, Given, Parked);

	TestEqual(TEXT("the parked ones were taken"), Slots.Parked(), 0);
	TestEqual(TEXT("the component did not grow"), Slots.Total(), 5);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsSettlesOverAWalk,
	"KBVE.World.InstanceSlots.SettlesAtTheSizeOfTheWindowOverALongWalk",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsSettlesOverAWalk::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	TArray<int32> Given, Parked;

	// A seven-wide window walked a hundred chunks. What must not happen is the
	// component growing with the distance travelled rather than with the window.
	//
	// One chunk wider than the window is the honest figure: a chunk arriving is
	// written before the chunk leaving is released, which is the order the actor
	// itself builds and releases in, so the high-water mark is the window plus
	// the one in hand.
	const int32 Width = 7;
	for (int32 Step = 0; Step < 100; ++Step)
	{
		for (int32 At = Step; At < Step + Width; ++At)
		{
			Slots.Assign(FIntPoint(At, 0), 8, Given, Parked);
		}

		if (Step > 0)
		{
			Slots.Drop(FIntPoint(Step - 1, 0), Parked);
		}
	}

	TestEqual(TEXT("the component is the window, not the walk"), Slots.Total(),
		(Width + 1) * 8);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsParksASurplus,
	"KBVE.World.InstanceSlots.ParksWhatAShrinkingKeyGivesUp",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsParksASurplus::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	TArray<int32> Given, Parked;

	Slots.Assign(FIntPoint(0, 0), 6, Given, Parked);
	const TArray<int32> Full = Given;

	Slots.Assign(FIntPoint(0, 0), 2, Given, Parked);

	TestEqual(TEXT("it kept the two it still needs"), Given.Num(), 2);
	TestEqual(TEXT("it kept the ones it already had"), Given[0], Full[0]);
	TestEqual(TEXT("and the second of them"), Given[1], Full[1]);
	TestEqual(TEXT("the other four are parked"), Parked.Num(), 4);
	TestEqual(TEXT("nothing new was handed out"), Slots.Total(), 6);
	return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FKBVEWorldInstanceSlotsEmptiesToNothingLive,
	"KBVE.World.InstanceSlots.ResetParksEverythingAndKeepsItAvailable",
	EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)

bool FKBVEWorldInstanceSlotsEmptiesToNothingLive::RunTest(const FString&)
{
	FKBVEWorldInstanceSlots Slots;
	FStandIn Stand;
	TArray<int32> Given, Parked;

	Slots.Assign(FIntPoint(0, 0), 3, Given, Parked);
	Stand.Apply(Given, Parked, TEXT("A"));
	Slots.Assign(FIntPoint(1, 0), 4, Given, Parked);
	Stand.Apply(Given, Parked, TEXT("B"));

	Slots.Reset(Parked);
	Stand.Apply(TArray<int32>(), Parked, FString());

	TestEqual(TEXT("nothing is drawn"), Stand.Live(), 0);
	TestEqual(TEXT("all of it is available"), Slots.Parked(), 7);
	TestFalse(TEXT("no key holds anything"), Slots.Holds(FIntPoint(0, 0)));

	Slots.Assign(FIntPoint(5, 5), 7, Given, Parked);
	TestEqual(TEXT("a regrow reuses every slot"), Slots.Total(), 7);
	return true;
}

#endif
