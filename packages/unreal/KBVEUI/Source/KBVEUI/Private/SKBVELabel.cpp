#include "SKBVELabel.h"

#include "KBVEUIStyle.h"
#include "Widgets/Text/STextBlock.h"

void SKBVELabel::Construct(const FArguments& InArgs)
{
	ChildSlot
	[
		SNew(STextBlock)
		.Text(InArgs._Text)
		.TextStyle(&FKBVEUIStyle::GetTextStyle(InArgs._StyleName))
		.Justification(InArgs._Justification)
		.AutoWrapText(InArgs._AutoWrap)
	];
}
