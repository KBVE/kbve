#include "ROWSHttpTransport.h"
#include "ROWSSubsystem.h"
#include "HttpModule.h"
#include "Containers/Ticker.h"

void FROWSHttpTransport::Send(
	const FString& BasePath,
	const FString& Endpoint,
	const FString& PostContent,
	const FROWSRequestContext& Context,
	const FROWSRequestOptions& Options,
	const FHttpRequestCompleteDelegate& Callback)
{
	SendAttempt(BasePath, Endpoint, PostContent, Context, Options, Callback, 0);
}

bool FROWSHttpTransport::IsTransient(bool bWasSuccessful, int32 ResponseCode)
{
	return !bWasSuccessful || ResponseCode == 0 || ResponseCode == 429 || ResponseCode >= 500;
}

float FROWSHttpTransport::BackoffSeconds(int32 Attempt)
{
	const float Base = FMath::Min(8.0f, 0.5f * FMath::Pow(2.0f, static_cast<float>(Attempt)));
	return Base + FMath::FRandRange(0.0f, 0.25f);
}

void FROWSHttpTransport::SendAttempt(
	const FString& BasePath,
	const FString& Endpoint,
	const FString& PostContent,
	const FROWSRequestContext& Context,
	const FROWSRequestOptions& Options,
	const FHttpRequestCompleteDelegate& Callback,
	int32 Attempt)
{
	FHttpModule& Http = FHttpModule::Get();
	TSharedRef<IHttpRequest, ESPMode::ThreadSafe> Request = Http.CreateRequest();

	Request->SetURL(BasePath + Endpoint);
	Request->SetVerb(TEXT("POST"));
	Request->SetTimeout(Options.TimeoutSeconds);
	Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
	Request->SetHeader(TEXT("X-CustomerGUID"), Context.CustomerKey);
	if (!Context.ServiceKey.IsEmpty())
	{
		Request->SetHeader(TEXT("x-service-key"), Context.ServiceKey);
	}
	if (!Context.SupabaseAccessToken.IsEmpty())
	{
		Request->SetHeader(TEXT("Authorization"), FString::Printf(TEXT("Bearer %s"), *Context.SupabaseAccessToken));
	}
	if (!Context.SupabaseUserId.IsEmpty())
	{
		Request->SetHeader(TEXT("X-Supabase-User-Id"), Context.SupabaseUserId);
	}
	Request->SetContentAsString(PostContent);

	Request->OnProcessRequestComplete().BindLambda(
		[this, BasePath, Endpoint, PostContent, Context, Options, Callback, Attempt]
		(FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bWasSuccessful)
		{
			const int32 Code = Resp.IsValid() ? Resp->GetResponseCode() : 0;
			if (IsTransient(bWasSuccessful, Code) && Attempt < Options.MaxRetries)
			{
				const float Delay = BackoffSeconds(Attempt);
				UE_LOG(LogROWS, Warning, TEXT("ROWS %s transient failure (code %d) — retry %d/%d in %.2fs"),
					*Endpoint, Code, Attempt + 1, Options.MaxRetries, Delay);
				FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateLambda(
					[this, BasePath, Endpoint, PostContent, Context, Options, Callback, Attempt](float) -> bool
					{
						SendAttempt(BasePath, Endpoint, PostContent, Context, Options, Callback, Attempt + 1);
						return false;
					}), Delay);
				return;
			}
			Callback.ExecuteIfBound(Req, Resp, bWasSuccessful);
		});

	Request->ProcessRequest();
}
