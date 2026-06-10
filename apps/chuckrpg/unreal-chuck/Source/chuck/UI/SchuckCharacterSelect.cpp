#include "SchuckCharacterSelect.h"
#include "chuckSessionSubsystem.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Views/STableRow.h"
#include "Widgets/Layout/SBorder.h"

void SchuckCharacterSelect::Construct(const FArguments& InArgs)
{
	Session = InArgs._Session;
	OnEnterWorld = InArgs._OnEnterWorld;

	ChildSlot
	[
		SNew(SBorder)
		.Padding(16.0f)
		[
			SNew(SVerticalBox)
			+ SVerticalBox::Slot().AutoHeight().Padding(4.0f)
			[
				SNew(STextBlock).Text(NSLOCTEXT("chuck", "CharSelectTitle", "Select Character"))
			]
			+ SVerticalBox::Slot().FillHeight(1.0f).Padding(4.0f)
			[
				SAssignNew(ListView, SListView<TSharedPtr<FROWSUserCharacter>>)
				.ListItemsSource(&Items)
				.OnGenerateRow(this, &SchuckCharacterSelect::OnGenerateRow)
				.OnSelectionChanged(this, &SchuckCharacterSelect::OnSelectionChanged)
				.SelectionMode(ESelectionMode::Single)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(4.0f)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().FillWidth(1.0f)
				[
					SAssignNew(NameBox, SEditableTextBox)
					.HintText(NSLOCTEXT("chuck", "CharNameHint", "New character name"))
				]
				+ SHorizontalBox::Slot().AutoWidth().Padding(4.0f, 0.0f)
				[
					SNew(SButton)
					.Text(NSLOCTEXT("chuck", "CharCreate", "Create"))
					.OnClicked(this, &SchuckCharacterSelect::HandleCreate)
				]
				+ SHorizontalBox::Slot().AutoWidth().Padding(4.0f, 0.0f)
				[
					SNew(SButton)
					.Text(NSLOCTEXT("chuck", "CharDelete", "Delete"))
					.OnClicked(this, &SchuckCharacterSelect::HandleDelete)
				]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(4.0f)
			[
				SNew(SButton)
				.Text(NSLOCTEXT("chuck", "CharEnter", "Enter World"))
				.OnClicked(this, &SchuckCharacterSelect::HandleEnter)
			]
		]
	];
}

void SchuckCharacterSelect::RefreshList(const TArray<FROWSUserCharacter>& Characters)
{
	Items.Reset();
	for (const FROWSUserCharacter& Character : Characters)
	{
		Items.Add(MakeShared<FROWSUserCharacter>(Character));
	}
	if (ListView.IsValid())
	{
		ListView->RequestListRefresh();
	}
}

TSharedRef<ITableRow> SchuckCharacterSelect::OnGenerateRow(TSharedPtr<FROWSUserCharacter> Item, const TSharedRef<STableViewBase>& OwnerTable)
{
	const FText Label = FText::FromString(FString::Printf(TEXT("%s  (Lv %d %s)"), *Item->CharacterName, Item->Level, *Item->ClassName));
	return SNew(STableRow<TSharedPtr<FROWSUserCharacter>>, OwnerTable)
		[
			SNew(STextBlock).Text(Label)
		];
}

void SchuckCharacterSelect::OnSelectionChanged(TSharedPtr<FROWSUserCharacter> Item, ESelectInfo::Type SelectInfo)
{
	if (!Item.IsValid())
	{
		return;
	}
	SelectedName = Item->CharacterName;
	if (Session.IsValid())
	{
		Session->SelectCharacter(SelectedName);
	}
}

FReply SchuckCharacterSelect::HandleCreate()
{
	if (Session.IsValid() && NameBox.IsValid())
	{
		const FString Name = NameBox->GetText().ToString().TrimStartAndEnd();
		if (!Name.IsEmpty())
		{
			Session->CreateCharacter(Name, TEXT("Adventurer"));
			NameBox->SetText(FText::GetEmpty());
		}
	}
	return FReply::Handled();
}

FReply SchuckCharacterSelect::HandleDelete()
{
	if (Session.IsValid() && !SelectedName.IsEmpty())
	{
		Session->RemoveCharacter(SelectedName);
		SelectedName.Reset();
	}
	return FReply::Handled();
}

FReply SchuckCharacterSelect::HandleEnter()
{
	if (!SelectedName.IsEmpty())
	{
		OnEnterWorld.ExecuteIfBound();
	}
	return FReply::Handled();
}
