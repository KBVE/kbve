#include "SKBVEItemGrid.h"

#include "Widgets/SNullWidget.h"
#include "Widgets/Layout/SGridPanel.h"

void SKBVEItemGrid::Construct(const FArguments& InArgs)
{
	TSharedRef<SGridPanel> Grid = SNew(SGridPanel);

	if (InArgs._OnBuildSlot.IsBound() && InArgs._Columns > 0 && InArgs._Rows > 0)
	{
		for (int32 R = 0; R < InArgs._Rows; ++R)
		{
			for (int32 C = 0; C < InArgs._Columns; ++C)
			{
				const int32 Index = R * InArgs._Columns + C;
				Grid->AddSlot(C, R)
				.Padding(InArgs._SlotPadding)
				[
					InArgs._OnBuildSlot.Execute(Index)
				];
			}
		}
	}

	ChildSlot
	[
		Grid
	];
}
