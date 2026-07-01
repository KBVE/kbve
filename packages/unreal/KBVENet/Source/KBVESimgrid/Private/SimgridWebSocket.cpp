#include "SimgridWebSocket.h"
#include "KBVESimgridModule.h"
#include "WebSocketsModule.h"
#include "IWebSocket.h"

void FSimgridWebSocket::Connect(const FString& Url)
{
	if (!FModuleManager::Get().IsModuleLoaded("WebSockets"))
	{
		FModuleManager::Get().LoadModule("WebSockets");
	}

	Socket = FWebSocketsModule::Get().CreateWebSocket(Url, TEXT(""));
	if (!Socket.IsValid())
	{
		OnError.Broadcast(TEXT("Failed to create WebSocket"));
		return;
	}

	Socket->OnConnected().AddLambda([this]()
	{
		OnOpen.Broadcast();
	});
	Socket->OnConnectionError().AddLambda([this](const FString& Err)
	{
		OnError.Broadcast(Err);
	});
	Socket->OnClosed().AddLambda([this](int32 Code, const FString& Reason, bool bClean)
	{
		OnClose.Broadcast(Code, Reason, bClean);
	});
	Socket->OnRawMessage().AddLambda([this](const void* Data, SIZE_T Size, SIZE_T BytesRemaining)
	{
		HandleRaw(Data, Size, BytesRemaining);
	});

	Socket->Connect();
}

void FSimgridWebSocket::HandleRaw(const void* Data, SIZE_T Size, SIZE_T BytesRemaining)
{
	const uint8* Bytes = static_cast<const uint8*>(Data);
	RxAccum.Append(Bytes, (int32)Size);
	if (BytesRemaining == 0)
	{
		TArray<uint8> Frame = MoveTemp(RxAccum);
		RxAccum.Reset();
		OnBinary.Broadcast(Frame);
	}
}

void FSimgridWebSocket::SendBinary(const TArray<uint8>& Bytes)
{
	if (Socket.IsValid() && Socket->IsConnected())
	{
		Socket->Send(Bytes.GetData(), Bytes.Num(), true);
	}
	else
	{
		UE_LOG(LogKBVESimgrid, Warning, TEXT("SendBinary dropped: socket not connected"));
	}
}

void FSimgridWebSocket::Close()
{
	if (Socket.IsValid())
	{
		Socket->OnConnected().Clear();
		Socket->OnConnectionError().Clear();
		Socket->OnClosed().Clear();
		Socket->OnRawMessage().Clear();
		Socket->Close();
		Socket.Reset();
	}
}

bool FSimgridWebSocket::IsConnected() const
{
	return Socket.IsValid() && Socket->IsConnected();
}

FSimgridWebSocket::~FSimgridWebSocket()
{
	Close();
}
