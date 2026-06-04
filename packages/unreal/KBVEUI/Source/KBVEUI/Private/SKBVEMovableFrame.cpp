#include "SKBVEMovableFrame.h"

#include "Widgets/SBoxPanel.h"
#include "Widgets/SCanvas.h"
#include "Widgets/SOverlay.h"
#include "Widgets/Images/SImage.h"
#include "Widgets/Input/SButton.h"
#include "Widgets/Layout/SBox.h"
#include "Widgets/Text/STextBlock.h"
#include "Styling/CoreStyle.h"

namespace
{
	class SKBVEDragHandle : public SCompoundWidget
	{
	public:
		DECLARE_DELEGATE_OneParam(FOnDragMoved, const FVector2D& /*ScreenDelta*/);

		SLATE_BEGIN_ARGS(SKBVEDragHandle) {}
			SLATE_EVENT(FOnDragMoved, OnDragMoved)
			SLATE_DEFAULT_SLOT(FArguments, Content)
		SLATE_END_ARGS()

		void Construct(const FArguments& InArgs)
		{
			OnDragMoved = InArgs._OnDragMoved;
			ChildSlot
			[
				InArgs._Content.Widget
			];
		}

		virtual FReply OnMouseButtonDown(const FGeometry&, const FPointerEvent& Event) override
		{
			if (Event.GetEffectingButton() == EKeys::LeftMouseButton)
			{
				bDragging = true;
				LastScreen = Event.GetScreenSpacePosition();
				return FReply::Handled().CaptureMouse(SharedThis(this));
			}
			return FReply::Unhandled();
		}

		virtual FReply OnMouseMove(const FGeometry&, const FPointerEvent& Event) override
		{
			if (bDragging)
			{
				const FVector2D Cur = Event.GetScreenSpacePosition();
				const FVector2D Delta = Cur - LastScreen;
				LastScreen = Cur;
				OnDragMoved.ExecuteIfBound(Delta);
				return FReply::Handled();
			}
			return FReply::Unhandled();
		}

		virtual FReply OnMouseButtonUp(const FGeometry&, const FPointerEvent& Event) override
		{
			if (bDragging && Event.GetEffectingButton() == EKeys::LeftMouseButton)
			{
				bDragging = false;
				return FReply::Handled().ReleaseMouseCapture();
			}
			return FReply::Unhandled();
		}

	private:
		FOnDragMoved OnDragMoved;
		FVector2D LastScreen = FVector2D::ZeroVector;
		bool bDragging = false;
	};
}

void SKBVEMovableFrame::Construct(const FArguments& InArgs)
{
	Position         = InArgs._InitialPosition;
	FrameSize        = InArgs._FrameSize;
	Title            = InArgs._Title;
	OnCloseDelegate  = InArgs._OnCloseClicked;

	const FSlateFontInfo TitleFont = FCoreStyle::GetDefaultFontStyle("Bold", 18);
	const FLinearColor TitleBarColor(0.10f, 0.10f, 0.13f, 0.95f);
	const FLinearColor BodyColor(0.06f, 0.06f, 0.08f, 0.94f);
	const FLinearColor BorderColor(0.20f, 0.22f, 0.28f, 1.0f);

	ChildSlot
	[
		SNew(SCanvas)

		+ SCanvas::Slot()
		.Position(TAttribute<FVector2D>::CreateLambda([this]() { return Position; }))
		.Size(TAttribute<FVector2D>::CreateLambda([this]() { return FrameSize; }))
		[
			SNew(SOverlay)

			+ SOverlay::Slot()
			[
				SNew(SImage)
				.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
				.ColorAndOpacity(BorderColor)
			]

			+ SOverlay::Slot()
			.Padding(2.f)
			[
				SNew(SVerticalBox)

				+ SVerticalBox::Slot()
				.AutoHeight()
				[
					SNew(SKBVEDragHandle)
					.OnDragMoved_Lambda([this](const FVector2D& Delta) { Position += Delta; })
					[
						SNew(SOverlay)

						+ SOverlay::Slot()
						[
							SNew(SImage)
							.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
							.ColorAndOpacity(TitleBarColor)
						]

						+ SOverlay::Slot()
						.Padding(FMargin(14.f, 8.f))
						[
							SNew(SHorizontalBox)

							+ SHorizontalBox::Slot()
							.FillWidth(1.f)
							.VAlign(VAlign_Center)
							[
								SNew(STextBlock)
								.Text(Title)
								.Font(TitleFont)
								.ColorAndOpacity(FLinearColor::White)
							]

							+ SHorizontalBox::Slot()
							.AutoWidth()
							.VAlign(VAlign_Center)
							[
								SNew(SButton)
								.HAlign(HAlign_Center)
								.VAlign(VAlign_Center)
								.ContentPadding(FMargin(10.f, 4.f))
								.OnClicked(this, &SKBVEMovableFrame::HandleCloseClicked)
								[
									SNew(STextBlock)
									.Text(FText::FromString(TEXT("X")))
									.Font(FCoreStyle::GetDefaultFontStyle("Bold", 14))
								]
							]
						]
					]
				]

				+ SVerticalBox::Slot()
				.FillHeight(1.f)
				[
					SNew(SOverlay)

					+ SOverlay::Slot()
					[
						SNew(SImage)
						.Image(FCoreStyle::Get().GetBrush("WhiteBrush"))
						.ColorAndOpacity(BodyColor)
					]

					+ SOverlay::Slot()
					.Padding(FMargin(12.f))
					[
						InArgs._Body.Widget
					]
				]
			]
		]
	];
}

FReply SKBVEMovableFrame::HandleCloseClicked()
{
	OnCloseDelegate.ExecuteIfBound();
	return FReply::Handled();
}
