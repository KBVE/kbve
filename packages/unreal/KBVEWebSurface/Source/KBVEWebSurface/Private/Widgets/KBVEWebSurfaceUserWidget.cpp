#include "Widgets/KBVEWebSurfaceUserWidget.h"

#include "Blueprint/WidgetTree.h"
#include "WebBrowser.h"

TSharedRef<SWidget> UKBVEWebSurfaceUserWidget::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		Browser = WidgetTree->ConstructWidget<UWebBrowser>(UWebBrowser::StaticClass(), TEXT("WebBrowser"));
		WidgetTree->RootWidget = Browser;
	}
	return Super::RebuildWidget();
}
