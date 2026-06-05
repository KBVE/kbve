#include "Bridge/KBVEWebBridge.h"

#include "WebBrowser.h"

void UKBVEWebBridge::BindTo(UWebBrowser* Browser, FName BindName)
{
	if (!Browser || BindName.IsNone())
	{
		return;
	}
	if (BoundBrowser.IsValid() && BoundBrowser.Get() == Browser && BoundName == BindName)
	{
		return;
	}
	Browser->BindUObject(BindName.ToString(), this, /*bIsPermanent=*/true);
	BoundBrowser = Browser;
	BoundName = BindName;
}

void UKBVEWebBridge::UnbindFrom(UWebBrowser* Browser, FName BindName)
{
	if (!Browser || BindName.IsNone())
	{
		return;
	}
	Browser->UnbindUObject(BindName.ToString(), this, /*bIsPermanent=*/true);
	if (BoundBrowser.Get() == Browser && BoundName == BindName)
	{
		BoundBrowser = nullptr;
		BoundName = NAME_None;
	}
}

void UKBVEWebBridge::Push(FName Channel, const FString& Payload)
{
	UWebBrowser* Browser = BoundBrowser.Get();
	if (!Browser || BoundName.IsNone())
	{
		return;
	}
	const FString Script = FString::Printf(
		TEXT("window.%s && window.%s.onPush && window.%s.onPush('%s', %s);"),
		*BoundName.ToString(),
		*BoundName.ToString(),
		*BoundName.ToString(),
		*Channel.ToString(),
		*Payload);
	Browser->ExecuteJavascript(Script);
}

void UKBVEWebBridge::Dispatch(const FString& Channel, const FString& Payload)
{
	OnMessage.Broadcast(FName(*Channel), Payload);
}
