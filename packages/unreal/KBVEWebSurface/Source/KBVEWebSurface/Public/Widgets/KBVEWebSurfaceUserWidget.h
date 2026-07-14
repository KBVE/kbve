#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "KBVEWebSurfaceUserWidget.generated.h"

class UWebBrowser;

/** Code-only UMG widget that hosts a single UWebBrowser as its root. */
UCLASS()
class KBVEWEBSURFACE_API UKBVEWebSurfaceUserWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintReadOnly, Category = "KBVE|WebSurface", meta = (BindWidgetOptional))
	TObjectPtr<UWebBrowser> Browser;

protected:
	virtual TSharedRef<SWidget> RebuildWidget() override;
};
