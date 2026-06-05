#pragma once

#include "Backend/IKBVEWebBackend.h"
#include "UObject/WeakObjectPtr.h"

class UWebBrowser;

/** Default backend wrapping Unreal's stock CEF-based UWebBrowser. */
class KBVEWEBSURFACE_API FKBVEWebBackend_CEF : public IKBVEWebBackend
{
public:
	explicit FKBVEWebBackend_CEF(UWebBrowser* InBrowser);

	virtual FName GetBackendId() const override;
	virtual bool LoadURL(const FString& URL) override;
	virtual void ExecuteJavaScript(const FString& Script) override;
	virtual void Tick(float DeltaSeconds) override;
	virtual void SetFrameRateCap(int32 Fps) override;
	virtual bool IsValid() const override;

private:
	TWeakObjectPtr<UWebBrowser> BrowserRef;
	int32 FrameRateCap = 30;
};
