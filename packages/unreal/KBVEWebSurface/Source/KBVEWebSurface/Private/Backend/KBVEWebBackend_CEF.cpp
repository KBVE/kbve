#include "Backend/KBVEWebBackend_CEF.h"

#include "WebBrowser.h"

FKBVEWebBackend_CEF::FKBVEWebBackend_CEF(UWebBrowser* InBrowser)
	: BrowserRef(InBrowser)
{
}

FName FKBVEWebBackend_CEF::GetBackendId() const
{
	return TEXT("CEF");
}

bool FKBVEWebBackend_CEF::LoadURL(const FString& URL)
{
	if (UWebBrowser* B = BrowserRef.Get())
	{
		B->LoadURL(URL);
		return true;
	}
	return false;
}

void FKBVEWebBackend_CEF::ExecuteJavaScript(const FString& Script)
{
	if (UWebBrowser* B = BrowserRef.Get())
	{
		B->ExecuteJavascript(Script);
	}
}

void FKBVEWebBackend_CEF::Tick(float DeltaSeconds)
{
}

void FKBVEWebBackend_CEF::SetFrameRateCap(int32 Fps)
{
	FrameRateCap = Fps;
}

bool FKBVEWebBackend_CEF::IsValid() const
{
	return BrowserRef.IsValid();
}
