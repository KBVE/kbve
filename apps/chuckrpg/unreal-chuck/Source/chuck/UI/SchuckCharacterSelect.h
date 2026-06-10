#pragma once

#include "CoreMinimal.h"
#include "Widgets/SCompoundWidget.h"
#include "Widgets/Views/SListView.h"
#include "Input/Reply.h"
#include "Framework/SlateDelegates.h"
#include "ROWSTypes.h"

class UchuckSessionSubsystem;
class SEditableTextBox;
class STableViewBase;
class ITableRow;

class SchuckCharacterSelect : public SCompoundWidget
{
public:
	SLATE_BEGIN_ARGS(SchuckCharacterSelect) {}
		SLATE_ARGUMENT(TWeakObjectPtr<UchuckSessionSubsystem>, Session)
		SLATE_EVENT(FSimpleDelegate, OnEnterWorld)
	SLATE_END_ARGS()

	void Construct(const FArguments& InArgs);

	void RefreshList(const TArray<FROWSUserCharacter>& Characters);

private:
	TSharedRef<ITableRow> OnGenerateRow(TSharedPtr<FROWSUserCharacter> Item, const TSharedRef<STableViewBase>& OwnerTable);
	void OnSelectionChanged(TSharedPtr<FROWSUserCharacter> Item, ESelectInfo::Type SelectInfo);

	FReply HandleCreate();
	FReply HandleDelete();
	FReply HandleEnter();

	TWeakObjectPtr<UchuckSessionSubsystem> Session;
	FSimpleDelegate OnEnterWorld;

	TArray<TSharedPtr<FROWSUserCharacter>> Items;
	TSharedPtr<SListView<TSharedPtr<FROWSUserCharacter>>> ListView;
	TSharedPtr<SEditableTextBox> NameBox;
	FString SelectedName;
};
