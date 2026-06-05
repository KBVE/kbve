#include "Bridge/KBVEWebBridge.h"

#include "WebBrowser.h"

void UKBVEWebBridge::Receive(FName Channel, const FString& Payload)
{
	OnMessage.Broadcast(Channel, Payload);
}

void UKBVEWebBridge::Send(UWebBrowser* Browser, FName Channel, const FString& Payload)
{
	if (!Browser)
	{
		return;
	}
	const FString Script = FString::Printf(
		TEXT("window.kbveBridge && window.kbveBridge.onMessage && window.kbveBridge.onMessage('%s', %s);"),
		*Channel.ToString(),
		*Payload);
	Browser->ExecuteJavascript(Script);
}
