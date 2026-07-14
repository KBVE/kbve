#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "SimgridNameplateWidget.generated.h"

class UTextBlock;
class UProgressBar;
class USizeBox;

UENUM()
enum class ESimgridNameplateBar : uint8
{
	Health = 0,
	Mana = 1,
	Energy = 2,
	Stamina = 3,
	Count = 4
};

UCLASS()
class KBVESIMGRIDRENDER_API USimgridNameplateWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	void SetDisplayName(const FString& Name);
	void SetBar(ESimgridNameplateBar Bar, float Current, float Max);

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;

private:
	UPROPERTY()
	TObjectPtr<UTextBlock> NameBlock;

	UPROPERTY()
	TObjectPtr<UProgressBar> Bars[(uint8)ESimgridNameplateBar::Count];

	UPROPERTY()
	TObjectPtr<USizeBox> BarBoxes[(uint8)ESimgridNameplateBar::Count];

	FString DisplayName;
};
