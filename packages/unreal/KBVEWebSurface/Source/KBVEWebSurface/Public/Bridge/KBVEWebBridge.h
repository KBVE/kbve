#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "UObject/WeakObjectPtr.h"
#include "KBVEWebBridge.generated.h"

class UWebBrowser;

DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FKBVEWebBridgeMessage, FName, Channel, const FString&, Payload);

/**
 * Typed JS↔UE message bus. The bridge is bound into a UWebBrowser instance via
 * UWebBrowser::BindUObject, exposing UFUNCTIONs to JS as window.<BindName>.<func>.
 *
 *   // JS
 *   window.kbveBridge.dispatch('inventory.use', JSON.stringify({ slot: 3 }));
 *
 *   // UE
 *   Bridge->OnMessage.AddDynamic(this, &AMyActor::HandleBridge);
 */
UCLASS(BlueprintType)
class KBVEWEBSURFACE_API UKBVEWebBridge : public UObject
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintAssignable, Category = "KBVE|WebSurface|Bridge")
	FKBVEWebBridgeMessage OnMessage;

	void BindTo(UWebBrowser* Browser, FName BindName);
	void UnbindFrom(UWebBrowser* Browser, FName BindName);

	UFUNCTION(BlueprintCallable, Category = "KBVE|WebSurface|Bridge")
	void Push(FName Channel, const FString& Payload);

	UFUNCTION()
	void Dispatch(const FString& Channel, const FString& Payload);

private:
	TWeakObjectPtr<UWebBrowser> BoundBrowser;
	FName BoundName;
};
