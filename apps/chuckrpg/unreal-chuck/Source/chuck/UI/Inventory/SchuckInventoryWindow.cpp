#include "SchuckInventoryWindow.h"

#include "ChuckUIStyle.h"
#include "chuckCoreCharacter.h"
#include "chuckInventory.h"
#include "chuckSettings.h"
#include "SchuckEquipmentPanel.h"
#include "SchuckInventorySlot.h"
#include "SchuckItemInfo.h"
#include "SKBVEMovableFrame.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SGridPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

#define LOCTEXT_NAMESPACE "SchuckInventoryWindow"

void SchuckInventoryWindow::Construct(const FArguments& InArgs)
{
	Character = InArgs._OwningCharacter;
	OnClose   = InArgs._OnCloseClicked;

	SelectedKey = MakeShared<int32>(0);

	constexpr int32 Cols     = 4;
	constexpr int32 Rows     = 6;
	constexpr float SlotSize = 72.f;
	constexpr float SlotPad  = 6.f;

	TSharedRef<SGridPanel> Grid = SNew(SGridPanel);
	for (int32 R = 0; R < Rows; ++R)
	{
		for (int32 C = 0; C < Cols; ++C)
		{
			const int32 Idx = R * Cols + C;
			Grid->AddSlot(C, R)
			.Padding(SlotPad)
			[
				SNew(SchuckInventorySlot)
				.OwningCharacter(Character)
				.SlotIndex(Idx)
				.SlotSize(SlotSize)
				.bIsHotbar(false)
				.SelectedKey(SelectedKey)
			];
		}
	}

	const float BagWidth  = Cols * (SlotSize + SlotPad * 2.f) + 24.f;
	const float InfoWidth = 360.f;
	const float EquipWidth = 280.f;
	const float ContentHeight = Rows * (SlotSize + SlotPad * 2.f) + 16.f;

	const float FrameW = EquipWidth + BagWidth + InfoWidth + 32.f;
	const float FrameH = ContentHeight + 64.f;

	FVector2D StartPos(160.f, 140.f);
	FVector2D StartSize(FrameW, FrameH);
	const FName WindowKey = FName(TEXT("chuck.inventory"));
	if (AchuckCoreCharacter* C = Character.Get())
	{
		if (UchuckSettings* S = UchuckSettings::Get(C))
		{
			FchuckWindowGeometry G;
			if (S->GetWindowGeometry(WindowKey, G))
			{
				StartPos  = G.Position;
				StartSize = G.Size;
			}
		}
	}

	ChildSlot
	[
		SAssignNew(MovableFrame, SKBVEMovableFrame)
		.Title(LOCTEXT("Title", "Inventory"))
		.InitialPosition(StartPos)
		.FrameSize(StartSize)
		.MinFrameSize(FVector2D(640.f, 420.f))
		.OnCloseClicked(OnClose)
		.OnGeometryChanged_Lambda([this, WindowKey]()
		{
			if (!MovableFrame.IsValid()) return;
			AchuckCoreCharacter* C = Character.Get();
			UchuckSettings* S = C ? UchuckSettings::Get(C) : nullptr;
			if (!S) return;
			FchuckWindowGeometry G;
			G.WindowKey = WindowKey;
			G.Position  = MovableFrame->GetCurrentPosition();
			G.Size      = MovableFrame->GetCurrentSize();
			S->SetWindowGeometry(G);
		})
		.Body()
		[
			SNew(SHorizontalBox)

			+ SHorizontalBox::Slot()
			.AutoWidth()
			.Padding(FMargin(0.f, 0.f, 12.f, 0.f))
			[
				SNew(SBox)
				.WidthOverride(EquipWidth)
				[
					SNew(SchuckEquipmentPanel)
					.OwningCharacter(Character)
					.SelectedKey(SelectedKey)
				]
			]

			+ SHorizontalBox::Slot()
			.AutoWidth()
			[
				SNew(SBox)
				.WidthOverride(BagWidth)
				[
					Grid
				]
			]

			+ SHorizontalBox::Slot()
			.FillWidth(1.f)
			.Padding(FMargin(12.f, 0.f, 0.f, 0.f))
			[
				SNew(SchuckItemInfo)
				.OwningCharacter(Character)
				.SelectedKey(SelectedKey)
			]
		]
	];
}

void SchuckInventoryWindow::Tick(const FGeometry& AllottedGeometry, const double InCurrentTime, const float InDeltaTime)
{
	SCompoundWidget::Tick(AllottedGeometry, InCurrentTime, InDeltaTime);
	if (!SelectedKey.IsValid() || *SelectedKey == 0) return;

	AchuckCoreCharacter* C = Character.Get();
	if (!C) return;
	const FchuckInventory& Inv = C->GetInventory();
	const int32 Want = *SelectedKey;
	auto HasKey = [&](const TArray<FchuckInventoryStack>& Slots) -> bool
	{
		for (const FchuckInventoryStack& S : Slots)
		{
			if (!S.IsEmpty() && S.ItemKey == Want) return true;
		}
		return false;
	};
	if (!HasKey(Inv.DefaultBag.Slots) && !HasKey(Inv.Hotbar.Slots))
	{
		*SelectedKey = 0;
	}
}

#undef LOCTEXT_NAMESPACE
