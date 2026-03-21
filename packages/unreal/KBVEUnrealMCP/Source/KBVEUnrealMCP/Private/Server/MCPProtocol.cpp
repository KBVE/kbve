#include "Server/MCPProtocol.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

bool MCPProtocol::ParseRequest(const FString& RawJson, FString& OutId, FString& OutMethod, TSharedPtr<FJsonObject>& OutParams)
{
	TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(RawJson);
	TSharedPtr<FJsonObject> Root;

	if (!FJsonSerializer::Deserialize(Reader, Root) || !Root.IsValid())
	{
		return false;
	}

	if (!Root->TryGetStringField(TEXT("id"), OutId))
	{
		OutId = FGuid::NewGuid().ToString(EGuidFormats::Short);
	}

	if (!Root->TryGetStringField(TEXT("method"), OutMethod))
	{
		return false;
	}

	const TSharedPtr<FJsonObject>* ParamsObj = nullptr;
	if (Root->TryGetObjectField(TEXT("params"), ParamsObj) && ParamsObj)
	{
		OutParams = *ParamsObj;
	}
	else
	{
		OutParams = MakeShared<FJsonObject>();
	}

	return true;
}

FString MCPProtocol::FormatResponse(const FString& Id, bool bSuccess, const TSharedPtr<FJsonObject>& ResultOrError)
{
	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("id"), Id);
	Root->SetBoolField(TEXT("success"), bSuccess);

	if (ResultOrError.IsValid())
	{
		if (bSuccess)
		{
			Root->SetObjectField(TEXT("result"), ResultOrError);
		}
		else
		{
			Root->SetObjectField(TEXT("error"), ResultOrError);
		}
	}

	FString Output;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output, 0);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
	return Output;
}

FString MCPProtocol::FormatHeartbeat()
{
	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("type"), TEXT("heartbeat"));
	Root->SetNumberField(TEXT("timestamp"), FPlatformTime::Seconds());

	FString Output;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output, 0);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
	return Output;
}

FString MCPProtocol::FormatProgress(const FString& Id, float Progress, const FString& Message)
{
	TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("id"), Id);
	Root->SetStringField(TEXT("type"), TEXT("progress"));
	Root->SetNumberField(TEXT("progress"), Progress);
	Root->SetStringField(TEXT("message"), Message);

	FString Output;
	TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Output, 0);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);
	return Output;
}
