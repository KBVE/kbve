#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "KBVEWebBridge.generated.h"

class UWebBrowser;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKBVEWebBridgeMessage, FName, Channel, const FString&, Payload);

/** Typed JS↔UE message bus. Web pages publish via window.kbveBridge.send(channel, payload). */
UCLASS(BlueprintType)
class KBVEWEBSURFACE_API UKBVEWebBridge : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintAssignable, Category = "KBVE|WebSurface|Bridge")
	FKBVEWebBridgeMessage OnMessage;

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Bridge")
	void Receive(FName Channel, const FString& Payload);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Bridge")
	void Send(UWebBrowser* Browser, FName Channel, const FString& Payload);
};
