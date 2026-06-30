#pragma once

#include "CoreMinimal.h"

class IWebSocket;

class KBVESIMGRID_API FSimgridWebSocket
{
public:
	DECLARE_MULTICAST_DELEGATE(FOnOpen);
	DECLARE_MULTICAST_DELEGATE_ThreeParams(FOnClose, int32, const FString&, bool);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnError, const FString&);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnBinary, const TArray<uint8>&);

	FOnOpen OnOpen;
	FOnClose OnClose;
	FOnError OnError;
	FOnBinary OnBinary;

	void Connect(const FString& Url);
	void SendBinary(const TArray<uint8>& Bytes);
	void Close();
	bool IsConnected() const;
	~FSimgridWebSocket();

private:
	void HandleRaw(const void* Data, SIZE_T Size, SIZE_T BytesRemaining);

	TSharedPtr<IWebSocket> Socket;
	TArray<uint8> RxAccum;
};
