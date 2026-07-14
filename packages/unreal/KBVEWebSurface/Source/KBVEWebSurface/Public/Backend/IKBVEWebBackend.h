#pragma once

#include "CoreMinimal.h"

/** Abstract web rendering backend. Default impl wraps Unreal's CEF UWebBrowser. */
class KBVEWEBSURFACE_API IKBVEWebBackend
{
public:
	virtual ~IKBVEWebBackend() = default;

	virtual FName GetBackendId() const = 0;
	virtual bool LoadURL(const FString& URL) = 0;
	virtual void ExecuteJavaScript(const FString& Script) = 0;
	virtual void Tick(float DeltaSeconds) = 0;
	virtual void SetFrameRateCap(int32 Fps) = 0;
	virtual bool IsValid() const = 0;
};
