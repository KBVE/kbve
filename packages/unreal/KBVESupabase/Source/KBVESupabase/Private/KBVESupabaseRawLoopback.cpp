#include "KBVESupabaseRawLoopback.h"
#include "KBVESupabaseModule.h"
#include "Async/Async.h"
#include "Common/TcpListener.h"
#include "Sockets.h"
#include "SocketSubsystem.h"
#include "Interfaces/IPv4/IPv4Endpoint.h"

namespace
{
	FString NormalizeRawCallbackPath(const FString& In)
	{
		FString Out = In.TrimStartAndEnd();
		if (Out.IsEmpty()) { Out = TEXT("/auth/callback"); }
		if (!Out.StartsWith(TEXT("/"))) { Out.InsertAt(0, TEXT('/')); }
		while (Out.Len() > 1 && Out.EndsWith(TEXT("/")))
		{
			Out.LeftChopInline(1, EAllowShrinking::No);
		}
		return Out;
	}

	FString MakeHttpResponse(int32 Code, const TCHAR* Reason, const FString& ContentType, const FString& Body, const FString& Location)
	{
		FString Header = FString::Printf(TEXT("HTTP/1.1 %d %s\r\n"), Code, Reason);
		if (!Location.IsEmpty())
		{
			Header += FString::Printf(TEXT("Location: %s\r\n"), *Location);
		}
		if (!ContentType.IsEmpty())
		{
			Header += FString::Printf(TEXT("Content-Type: %s\r\n"), *ContentType);
		}
		// Body is ASCII/UTF-8 HTML; byte length == TCHAR count for our content.
		Header += FString::Printf(TEXT("Content-Length: %d\r\n"), Body.Len());
		Header += TEXT("Cache-Control: no-store\r\n");
		Header += TEXT("Connection: close\r\n\r\n");
		return Header + Body;
	}

	bool SendAll(FSocket* Socket, const FString& Payload)
	{
		FTCHARToUTF8 Utf8(*Payload);
		const uint8* Data = reinterpret_cast<const uint8*>(Utf8.Get());
		int32 Total = Utf8.Length();
		int32 Sent = 0;
		while (Sent < Total)
		{
			int32 ThisSend = 0;
			if (!Socket->Send(Data + Sent, Total - Sent, ThisSend) || ThisSend <= 0)
			{
				return false;
			}
			Sent += ThisSend;
		}
		return true;
	}
}

TSharedPtr<FKBVESupabaseRawLoopback> FKBVESupabaseRawLoopback::Start(
	int32 PortMin,
	int32 PortMax,
	const FString& InCallbackPath,
	const FString& InErrorHtml,
	FKBVESupabaseOAuthLoopbackComplete InOnComplete)
{
	if (PortMax < PortMin)
	{
		Swap(PortMin, PortMax);
	}

	ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
	if (!SocketSub)
	{
		return nullptr;
	}

	TSharedPtr<FKBVESupabaseRawLoopback> Self = MakeShared<FKBVESupabaseRawLoopback>();
	Self->CallbackPath = NormalizeRawCallbackPath(InCallbackPath);
	Self->ErrorHtml = InErrorHtml;
	Self->OnComplete = InOnComplete;

	for (int32 Port = PortMin; Port <= PortMax; ++Port)
	{
		FSocket* ListenSocket = SocketSub->CreateSocket(NAME_Stream, TEXT("KBVESupabaseRawLoopback"), false);
		if (!ListenSocket)
		{
			continue;
		}

		ListenSocket->SetReuseAddr(true);
		ListenSocket->SetNonBlocking(false);

		const FIPv4Endpoint Endpoint(FIPv4Address(127, 0, 0, 1), static_cast<uint16>(Port));
		TSharedRef<FInternetAddr> Addr = Endpoint.ToInternetAddr();

		if (!ListenSocket->Bind(*Addr) || !ListenSocket->Listen(8))
		{
			ListenSocket->Close();
			SocketSub->DestroySocket(ListenSocket);
			continue;
		}

		Self->BoundPort = Port;
		// FTcpListener takes ownership of the socket and destroys it on Stop().
		Self->Listener = MakeShared<FTcpListener>(*ListenSocket, FTimespan::FromMilliseconds(100), false);
		Self->Listener->OnConnectionAccepted().BindSP(Self.ToSharedRef(), &FKBVESupabaseRawLoopback::OnConnectionAccepted);
		break;
	}

	if (Self->BoundPort == 0)
	{
		UE_LOG(LogKBVESupabase, Warning,
			TEXT("Raw OAuth loopback failed to bind in range %d-%d"), PortMin, PortMax);
		return nullptr;
	}

	UE_LOG(LogKBVESupabase, Log,
		TEXT("Raw OAuth loopback listening at http://127.0.0.1:%d%s"), Self->BoundPort, *Self->CallbackPath);
	return Self;
}

FKBVESupabaseRawLoopback::~FKBVESupabaseRawLoopback()
{
	Stop();
}

FString FKBVESupabaseRawLoopback::GetCallbackURL() const
{
	return FString::Printf(TEXT("http://127.0.0.1:%d%s"), BoundPort, *CallbackPath);
}

void FKBVESupabaseRawLoopback::Stop()
{
	if (Listener.IsValid())
	{
		Listener->Stop();
		Listener.Reset();
	}
}

bool FKBVESupabaseRawLoopback::OnConnectionAccepted(FSocket* InSocket, const FIPv4Endpoint& Endpoint)
{
	// Called on the listener thread. We take ownership of InSocket (return true)
	// and are responsible for closing + destroying it.
	if (InSocket)
	{
		ServeConnection(InSocket);
		InSocket->Close();
		if (ISocketSubsystem* SocketSub = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM))
		{
			SocketSub->DestroySocket(InSocket);
		}
	}
	return true;
}

void FKBVESupabaseRawLoopback::ServeConnection(FSocket* Client)
{
	if (!Client->Wait(ESocketWaitConditions::WaitForRead, FTimespan::FromSeconds(3.0)))
	{
		return;
	}

	// Read the request head. We only need the GET request line; cap the read so a
	// malicious/oversized request can't grow unbounded.
	TArray<uint8> Buffer;
	Buffer.SetNumUninitialized(8192);
	int32 BytesRead = 0;
	FString RequestText;
	for (int32 Attempt = 0; Attempt < 8; ++Attempt)
	{
		int32 ThisRead = 0;
		if (!Client->Recv(Buffer.GetData(), Buffer.Num(), ThisRead) || ThisRead <= 0)
		{
			break;
		}
		const FUTF8ToTCHAR Chunk(reinterpret_cast<const ANSICHAR*>(Buffer.GetData()), ThisRead);
		RequestText += FString(Chunk.Length(), Chunk.Get());
		BytesRead += ThisRead;
		if (RequestText.Contains(TEXT("\r\n\r\n")) || BytesRead >= 64 * 1024)
		{
			break;
		}
		if (!Client->Wait(ESocketWaitConditions::WaitForRead, FTimespan::FromMilliseconds(50)))
		{
			break;
		}
	}

	if (RequestText.IsEmpty())
	{
		return;
	}

	// First line: "GET /auth/callback?code=...&state=... HTTP/1.1"
	FString FirstLine;
	if (!RequestText.Split(TEXT("\r\n"), &FirstLine, nullptr))
	{
		FirstLine = RequestText;
	}

	TArray<FString> Tokens;
	FirstLine.ParseIntoArray(Tokens, TEXT(" "), true);
	const FString Target = Tokens.IsValidIndex(1) ? Tokens[1] : FString();

	FString Path = Target;
	FString Query;
	Target.Split(TEXT("?"), &Path, &Query);

	if (Path != CallbackPath)
	{
		SendAll(Client, MakeHttpResponse(404, TEXT("Not Found"), TEXT("text/plain"), TEXT("Not found"), FString()));
		return;
	}

	TMap<FString, FString> Params;
	KBVESupabaseParseQueryString(Query, Params);

	const FKBVESupabaseCallbackDecision Decision = KBVESupabaseEvaluateOAuthCallback(Params, ErrorHtml);

	switch (Decision.Action)
	{
	case EKBVESupabaseCallbackAction::FragmentBounce:
		SendAll(Client, MakeHttpResponse(200, TEXT("OK"), TEXT("text/html; charset=utf-8"), Decision.Body, FString()));
		return;
	case EKBVESupabaseCallbackAction::Redirect:
		SendAll(Client, MakeHttpResponse(301, TEXT("Moved Permanently"), FString(), FString(), Decision.RedirectLocation));
		break;
	case EKBVESupabaseCallbackAction::ShowHtml:
	default:
		SendAll(Client, MakeHttpResponse(200, TEXT("OK"), TEXT("text/html; charset=utf-8"), Decision.Body, FString()));
		break;
	}

	if (!Decision.bFireComplete || bCompleted)
	{
		return;
	}
	bCompleted = true;

	TWeakPtr<FKBVESupabaseRawLoopback> Weak = AsWeak();
	AsyncTask(ENamedThreads::GameThread, [Weak, Decision]()
	{
		TSharedPtr<FKBVESupabaseRawLoopback> Strong = Weak.Pin();
		if (!Strong.IsValid())
		{
			return;
		}
		Strong->OnComplete.ExecuteIfBound(
			Decision.bOk, Decision.Code, Decision.State, Decision.FullError, Decision.AccessToken);
	});
}
