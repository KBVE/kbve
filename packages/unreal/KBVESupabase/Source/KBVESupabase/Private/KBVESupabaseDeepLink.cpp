#include "KBVESupabaseDeepLink.h"
#include "KBVESupabaseModule.h"
#include "KBVESupabaseLoopback.h"
#include "Async/Async.h"
#include "Misc/CommandLine.h"

#if PLATFORM_MAC
// CocoaThread.h pulls Cocoa + Carbon + CoreServices through MacSystemIncludes.h,
// which renames Carbon's legacy `FVector` so it doesn't collide with UE's. Raw
// `#import <Cocoa/Cocoa.h>` here would fail to compile (FVector type clash).
#include "Mac/CocoaThread.h"
#endif

namespace
{
	FKBVESupabaseDeepLinkURLDelegate GDeepLinkURLDelegate;
	bool GRegistered = false;
}

#if PLATFORM_MAC

@interface KBVESupabaseURLHandler : NSObject
- (void)handleGetURLEvent:(NSAppleEventDescriptor*)event withReplyEvent:(NSAppleEventDescriptor*)reply;
@end

@implementation KBVESupabaseURLHandler
- (void)handleGetURLEvent:(NSAppleEventDescriptor*)event withReplyEvent:(NSAppleEventDescriptor*)reply
{
	NSString* UrlString = [[event paramDescriptorForKeyword:keyDirectObject] stringValue];
	if (UrlString != nil)
	{
		FKBVESupabaseDeepLink::DispatchURL(FString(UTF8_TO_TCHAR([UrlString UTF8String])));
	}
}
@end

static KBVESupabaseURLHandler* GMacURLHandler = nil;

#endif // PLATFORM_MAC

FKBVESupabaseDeepLinkURLDelegate& FKBVESupabaseDeepLink::OnDeepLinkURL()
{
	return GDeepLinkURLDelegate;
}

bool FKBVESupabaseDeepLink::MatchesScheme(const FString& Url, const FString& Scheme)
{
	const FString Trimmed = Scheme.TrimStartAndEnd();
	if (Trimmed.IsEmpty())
	{
		return false;
	}
	return Url.StartsWith(Trimmed + TEXT("://"), ESearchCase::IgnoreCase);
}

void FKBVESupabaseDeepLink::ParseURL(const FString& Url, TMap<FString, FString>& OutParams)
{
	// scheme://host/path?query#fragment — pull query + fragment, parse both.
	FString Work = Url;

	FString Fragment;
	if (Work.Split(TEXT("#"), &Work, &Fragment))
	{
		KBVESupabaseParseQueryString(Fragment, OutParams);
	}

	FString Query;
	if (Work.Split(TEXT("?"), nullptr, &Query))
	{
		KBVESupabaseParseQueryString(Query, OutParams);
	}
}

void FKBVESupabaseDeepLink::DispatchURL(const FString& Url)
{
	UE_LOG(LogKBVESupabase, Log, TEXT("Deep-link URL received: %s"), *Url);

	if (IsInGameThread())
	{
		GDeepLinkURLDelegate.Broadcast(Url);
		return;
	}

	FString Copy = Url;
	AsyncTask(ENamedThreads::GameThread, [Copy]()
	{
		GDeepLinkURLDelegate.Broadcast(Copy);
	});
}

void FKBVESupabaseDeepLink::RegisterHandlers()
{
	if (GRegistered)
	{
		return;
	}
	GRegistered = true;

#if PLATFORM_MAC
	if (GMacURLHandler == nil)
	{
		GMacURLHandler = [[KBVESupabaseURLHandler alloc] init];
		[[NSAppleEventManager sharedAppleEventManager]
			setEventHandler:GMacURLHandler
			andSelector:@selector(handleGetURLEvent:withReplyEvent:)
			forEventClass:kInternetEventClass
			andEventID:kAEGetURL];
		UE_LOG(LogKBVESupabase, Log, TEXT("Registered macOS Apple Event URL handler for deep-link OAuth."));
	}
#endif

	// Windows / Linux: the OS relaunches the app with the URL as an argument when a
	// scheme is invoked. Parse the startup command line for a registered scheme URL.
	const FString CmdLineStr(FCommandLine::Get());
	TArray<FString> Tokens;
	CmdLineStr.ParseIntoArray(Tokens, TEXT(" "), true);
	for (FString Token : Tokens)
	{
		Token = Token.TrimQuotes();
		if (Token.Contains(TEXT("://")) && !Token.StartsWith(TEXT("http")))
		{
			DispatchURL(Token);
		}
	}
}

void FKBVESupabaseDeepLink::UnregisterHandlers()
{
	if (!GRegistered)
	{
		return;
	}
	GRegistered = false;

#if PLATFORM_MAC
	if (GMacURLHandler != nil)
	{
		[[NSAppleEventManager sharedAppleEventManager]
			removeEventHandlerForEventClass:kInternetEventClass
			andEventID:kAEGetURL];
		GMacURLHandler = nil;
	}
#endif
}
