#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "ROWSLoadingWidget.generated.h"

class UTextBlock;

UCLASS()
class ROWS_API UROWSLoadingWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	virtual TSharedRef<SWidget> RebuildWidget() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

	UFUNCTION(BlueprintCallable, Category = "ROWS|Loading")
	void SetStatus(const FString& Message);

protected:
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|Loading") TObjectPtr<UTextBlock> StatusText;
	UPROPERTY(BlueprintReadOnly, Category = "ROWS|Loading") TObjectPtr<UTextBlock> DotsText;

private:
	bool bWidgetsCreated = false;
	float DotTimer = 0.f;
	int32 DotCount = 0;
};
