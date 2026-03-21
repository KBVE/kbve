#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

DECLARE_DELEGATE_TwoParams(FMCPResponseDelegate, bool /*bSuccess*/, TSharedPtr<FJsonObject> /*Result*/);

using FMCPHandler = TFunction<void(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)>;

namespace MCPProtocolHelpers
{
	inline TSharedPtr<FJsonObject> MakeResult()
	{
		return MakeShared<FJsonObject>();
	}

	inline TSharedPtr<FJsonObject> MakeError(const FString& Code, const FString& Message)
	{
		TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
		Err->SetStringField(TEXT("code"), Code);
		Err->SetStringField(TEXT("message"), Message);
		return Err;
	}

	inline void Succeed(FMCPResponseDelegate& OnComplete, TSharedPtr<FJsonObject> Result = nullptr)
	{
		if (!Result) Result = MakeResult();
		OnComplete.ExecuteIfBound(true, Result);
	}

	inline void Fail(FMCPResponseDelegate& OnComplete, const FString& Code, const FString& Message)
	{
		OnComplete.ExecuteIfBound(false, MakeError(Code, Message));
	}

	inline FMCPHandler MakeStub(const FString& Method)
	{
		return [Method](const TSharedPtr<FJsonObject>& /*Params*/, FMCPResponseDelegate OnComplete)
		{
			TSharedPtr<FJsonObject> Err = MakeShared<FJsonObject>();
			Err->SetStringField(TEXT("code"), TEXT("NOT_IMPLEMENTED"));
			Err->SetStringField(TEXT("message"), FString::Printf(TEXT("%s is not yet implemented"), *Method));
			OnComplete.ExecuteIfBound(false, Err);
		};
	}
}
