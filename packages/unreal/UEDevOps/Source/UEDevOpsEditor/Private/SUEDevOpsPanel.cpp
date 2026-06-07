#include "SUEDevOpsPanel.h"

#include "Editor.h"
#include "EditorAssetLibrary.h"
#include "Engine/GameInstance.h"
#include "Framework/Notifications/NotificationManager.h"
#include "Misc/Paths.h"
#include "Styling/CoreStyle.h"
#include "UEDevOpsGitHubService.h"
#include "UEDevOpsImportLibrary.h"
#include "UEDevOpsTelemetrySubsystem.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Input/SComboBox.h"
#include "Widgets/Input/SEditableTextBox.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Layout/SScrollBox.h"
#include "Widgets/Layout/SSeparator.h"
#include "Widgets/Notifications/SNotificationList.h"
#include "Widgets/SBoxPanel.h"
#include "Widgets/Text/STextBlock.h"

#define LOCTEXT_NAMESPACE "SUEDevOpsPanel"

const TArray<FString>& SUEDevOpsPanel::GetArtCategories()
{
	static const TArray<FString> Categories = {
		TEXT("Furniture"),
		TEXT("Environment"),
		TEXT("Decorations"),
		TEXT("Architecture"),
		TEXT("Props"),
		TEXT("Foliage"),
		TEXT("Characters"),
		TEXT("Animations"),
		TEXT("Skeletons"),
		TEXT("Weapons"),
		TEXT("Vehicles"),
		TEXT("FX"),
		TEXT("Lighting"),
		TEXT("UI"),
		TEXT("Icons"),
		TEXT("Materials"),
		TEXT("Textures"),
		TEXT("Audio"),
		TEXT("Cinematics"),
	};
	return Categories;
}

void SUEDevOpsPanel::ScaffoldArtCategories()
{
	UEditorAssetLibrary::MakeDirectory(TEXT("/Game/Art"));
	for (const FString& Cat : GetArtCategories())
	{
		UEditorAssetLibrary::MakeDirectory(FString::Printf(TEXT("/Game/Art/%s"), *Cat));
	}
}

void SUEDevOpsPanel::Construct(const FArguments& InArgs)
{
	const FSlateFontInfo HeaderFont = FCoreStyle::GetDefaultFontStyle("Bold", 16);
	const FSlateFontInfo SubFont    = FCoreStyle::GetDefaultFontStyle("Bold", 13);

	const FString DefaultSource = FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("Raw"));

	for (const FString& Cat : GetArtCategories())
	{
		CategoryOptions.Add(MakeShared<FString>(Cat));
	}
	SelectedCategory = CategoryOptions.Num() > 0 ? CategoryOptions[0] : MakeShared<FString>(TEXT("Furniture"));

	ScaffoldArtCategories();

	ChildSlot
	[
		SNew(SScrollBox)
		+ SScrollBox::Slot()
		.Padding(12.f)
		[
			SNew(SVerticalBox)

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SNew(STextBlock).Text(LOCTEXT("Header", "UEDevOps Panel")).Font(HeaderFont)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 14)
			[
				SNew(STextBlock).Text(LOCTEXT("Sub", "Editor tooling for KBVE — asset import, telemetry, GitHub")).ColorAndOpacity(FSlateColor(FLinearColor::Gray))
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("ImportHeader", "Asset Import")).Font(SubFont)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("SourceLabel", "Source folder (FBX + textures)"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SAssignNew(SourceInput, SEditableTextBox)
				.HintText(LOCTEXT("SourceHint", "/abs/path/to/Raw/Props/Arcade"))
				.Text(FText::FromString(DefaultSource))
				.OnTextChanged_Lambda([this](const FText&){ RefreshDestFromCategory(); })
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("CategoryLabel", "Category (/Game/Art/<category>)"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SAssignNew(CategoryCombo, SComboBox<TSharedPtr<FString>>)
				.OptionsSource(&CategoryOptions)
				.InitiallySelectedItem(SelectedCategory)
				.OnSelectionChanged(this, &SUEDevOpsPanel::OnCategoryChanged)
				.OnGenerateWidget_Lambda([](TSharedPtr<FString> Item)
				{
					return SNew(STextBlock).Text(FText::FromString(*Item));
				})
				[
					SNew(STextBlock).Text_Lambda([this]()
					{
						return SelectedCategory.IsValid() ? FText::FromString(*SelectedCategory) : FText::GetEmpty();
					})
				]
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("DestLabel", "Destination content path (auto-fills from category)"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SAssignNew(DestInput, SEditableTextBox)
				.HintText(LOCTEXT("DestHint", "/Game/Art/Furniture/Arcade"))
				.Text(FText::FromString(TEXT("/Game/Art/Furniture")))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("MatLabel", "Material name (optional)"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SAssignNew(MaterialInput, SEditableTextBox)
				.HintText(LOCTEXT("MatHint", "ArcadeCabinet  → builds M_ArcadeCabinet"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 4)
			[
				SNew(STextBlock).Text(LOCTEXT("ScaleLabel", "Mesh import scale (1.0 = default, 0.01 = Blender meters → UE cm)"))
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 8)
			[
				SAssignNew(ScaleInput, SEditableTextBox)
				.HintText(LOCTEXT("ScaleHint", "1.0"))
				.Text(FText::FromString(TEXT("1.0")))
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 14)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)
				[
					SNew(SButton)
					.Text(LOCTEXT("PickBtn", "Pick Folder..."))
					.OnClicked(this, &SUEDevOpsPanel::HandleImportPickClicked)
				]
				+ SHorizontalBox::Slot().AutoWidth()
				[
					SNew(SButton)
					.Text(LOCTEXT("RunBtn", "Run Import"))
					.OnClicked(this, &SUEDevOpsPanel::HandleImportRunClicked)
				]
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 10)
			[ SNew(SSeparator) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SNew(STextBlock).Text(LOCTEXT("ToolsHeader", "Tools")).Font(SubFont)
			]
			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SNew(SHorizontalBox)
				+ SHorizontalBox::Slot().AutoWidth().Padding(0, 0, 6, 0)
				[
					SNew(SButton)
					.Text(LOCTEXT("FlushBtn", "Flush Telemetry"))
					.OnClicked(this, &SUEDevOpsPanel::HandleFlushTelemetryClicked)
				]
				+ SHorizontalBox::Slot().AutoWidth()
				[
					SNew(SButton)
					.Text(LOCTEXT("IssueBtn", "Create GitHub Issue..."))
					.OnClicked(this, &SUEDevOpsPanel::HandleGitHubIssueClicked)
				]
			]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 6, 0, 10)
			[ SNew(SSeparator) ]

			+ SVerticalBox::Slot().AutoHeight().Padding(0, 0, 0, 6)
			[
				SNew(STextBlock).Text(LOCTEXT("LogHeader", "Activity")).Font(SubFont)
			]
			+ SVerticalBox::Slot().AutoHeight().MaxHeight(180.f)
			[
				SAssignNew(LogScroll, SScrollBox)
			]
		]
	];

	RefreshDestFromCategory();
}

void SUEDevOpsPanel::OnCategoryChanged(TSharedPtr<FString> NewCategory, ESelectInfo::Type)
{
	if (!NewCategory.IsValid()) return;
	SelectedCategory = NewCategory;
	RefreshDestFromCategory();
}

void SUEDevOpsPanel::RefreshDestFromCategory()
{
	if (!SelectedCategory.IsValid() || !DestInput.IsValid()) return;
	const FString Category = *SelectedCategory;

	FString SourceFolderName;
	if (SourceInput.IsValid())
	{
		const FString Src = SourceInput->GetText().ToString().TrimStartAndEnd();
		if (!Src.IsEmpty())
		{
			SourceFolderName = FPaths::GetCleanFilename(Src);
		}
	}

	FString NewDest = FString::Printf(TEXT("/Game/Art/%s"), *Category);
	if (!SourceFolderName.IsEmpty())
	{
		NewDest /= SourceFolderName;
	}
	DestInput->SetText(FText::FromString(NewDest));

	if (MaterialInput.IsValid() && MaterialInput->GetText().IsEmpty() && !SourceFolderName.IsEmpty())
	{
		MaterialInput->SetText(FText::FromString(SourceFolderName));
	}
}

void SUEDevOpsPanel::AppendLog(const FString& Line)
{
	if (!LogScroll.IsValid()) return;
	TSharedRef<STextBlock> Block = SNew(STextBlock).Text(FText::FromString(Line)).AutoWrapText(true);
	LogScroll->AddSlot()[ Block ];
	LogLines.Add(Block);
	LogScroll->ScrollToEnd();
}

FReply SUEDevOpsPanel::HandleImportPickClicked()
{
	FUEDevOpsImportLibrary::PromptAndImport();
	AppendLog(TEXT("→ Picker import dispatched"));
	return FReply::Handled();
}

FReply SUEDevOpsPanel::HandleImportRunClicked()
{
	const FString Source   = SourceInput->GetText().ToString().TrimStartAndEnd();
	const FString Dest     = DestInput->GetText().ToString().TrimStartAndEnd();
	const FString Material = MaterialInput->GetText().ToString().TrimStartAndEnd();

	if (Source.IsEmpty() || Dest.IsEmpty())
	{
		AppendLog(TEXT("✖ Source and destination are required"));
		return FReply::Handled();
	}

	float Scale = 1.0f;
	if (ScaleInput.IsValid())
	{
		const FString ScaleStr = ScaleInput->GetText().ToString().TrimStartAndEnd();
		if (!ScaleStr.IsEmpty())
		{
			Scale = FCString::Atof(*ScaleStr);
			if (Scale <= 0.f) Scale = 1.0f;
		}
	}

	const bool bOk = FUEDevOpsImportLibrary::ImportRawAssetFolder(Source, Dest, Material, Scale);
	AppendLog(FString::Printf(TEXT("%s Import: %s → %s%s  scale=%.3f"),
		bOk ? TEXT("✓") : TEXT("✖"),
		*Source, *Dest,
		Material.IsEmpty() ? TEXT("") : *FString::Printf(TEXT("  [M_%s]"), *Material),
		Scale));
	return FReply::Handled();
}

FReply SUEDevOpsPanel::HandleFlushTelemetryClicked()
{
	if (GEditor && GEditor->GetPIEWorldContext())
	{
		if (UWorld* W = GEditor->GetPIEWorldContext()->World())
		{
			if (UGameInstance* GI = W->GetGameInstance())
			{
				if (UUEDevOpsTelemetrySubsystem* Sub = GI->GetSubsystem<UUEDevOpsTelemetrySubsystem>())
				{
					Sub->FlushEvents();
					AppendLog(TEXT("✓ Telemetry flushed"));
					return FReply::Handled();
				}
			}
		}
	}
	AppendLog(TEXT("✖ No active PIE world — flush skipped"));
	return FReply::Handled();
}

FReply SUEDevOpsPanel::HandleGitHubIssueClicked()
{
	UUEDevOpsGitHubService::OpenCreateIssueDialog();
	AppendLog(TEXT("→ GitHub issue dialog opened"));
	return FReply::Handled();
}

#undef LOCTEXT_NAMESPACE
