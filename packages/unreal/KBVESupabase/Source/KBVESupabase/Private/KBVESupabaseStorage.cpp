#include "KBVESupabaseStorage.h"
#include "KBVESupabaseSubsystem.h"
#include "KBVESupabaseSettings.h"
#include "KBVESupabaseModule.h"
#include "GenericPlatform/GenericPlatformHttp.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Dom/JsonObject.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace
{
	FString JsonStringArray(const TArray<FString>& In)
	{
		FString Out = TEXT("[");
		for (int32 i = 0; i < In.Num(); ++i)
		{
			if (i > 0) Out += TEXT(",");
			FString Escaped = In[i];
			Escaped.ReplaceInline(TEXT("\\"), TEXT("\\\\"));
			Escaped.ReplaceInline(TEXT("\""), TEXT("\\\""));
			Out += FString::Printf(TEXT("\"%s\""), *Escaped);
		}
		Out += TEXT("]");
		return Out;
	}

	void StringToBytes(const FString& In, TArray<uint8>& Out)
	{
		const FTCHARToUTF8 Conv(*In);
		Out.SetNumUninitialized(Conv.Length());
		FMemory::Memcpy(Out.GetData(), Conv.Get(), Conv.Length());
	}

	FString BytesToString(const TArray<uint8>& In)
	{
		if (In.Num() == 0) return FString();
		const FUTF8ToTCHAR Conv(reinterpret_cast<const ANSICHAR*>(In.GetData()), In.Num());
		return FString(Conv.Length(), Conv.Get());
	}
}

void UKBVESupabaseStorage::Init(UKBVESupabaseSubsystem* InParent)
{
	Parent = InParent;
}

FString UKBVESupabaseStorage::GetStorageBase() const
{
	if (const UKBVESupabaseSettings* Settings = GetDefault<UKBVESupabaseSettings>())
	{
		return Settings->GetStorageBase();
	}
	return FString();
}

FString UKBVESupabaseStorage::EncodeObjectPath(const FString& InPath)
{
	FString Stripped = InPath;
	while (Stripped.StartsWith(TEXT("/")))
	{
		Stripped.RightChopInline(1, EAllowShrinking::No);
	}

	TArray<FString> Segments;
	Stripped.ParseIntoArray(Segments, TEXT("/"), /*InCullEmpty=*/true);

	FString Out;
	for (int32 i = 0; i < Segments.Num(); ++i)
	{
		if (i > 0) Out += TEXT("/");
		Out += FGenericPlatformHttp::UrlEncode(Segments[i]);
	}
	return Out;
}

FString UKBVESupabaseStorage::GuessContentType(const FString& InPathOrName)
{
	const FString Ext = FPaths::GetExtension(InPathOrName, /*bIncludeDot=*/false).ToLower();
	if (Ext == TEXT("png"))  return TEXT("image/png");
	if (Ext == TEXT("jpg") || Ext == TEXT("jpeg")) return TEXT("image/jpeg");
	if (Ext == TEXT("gif"))  return TEXT("image/gif");
	if (Ext == TEXT("webp")) return TEXT("image/webp");
	if (Ext == TEXT("svg"))  return TEXT("image/svg+xml");
	if (Ext == TEXT("json")) return TEXT("application/json");
	if (Ext == TEXT("txt"))  return TEXT("text/plain; charset=utf-8");
	if (Ext == TEXT("csv"))  return TEXT("text/csv");
	if (Ext == TEXT("html") || Ext == TEXT("htm")) return TEXT("text/html; charset=utf-8");
	if (Ext == TEXT("xml"))  return TEXT("application/xml");
	if (Ext == TEXT("pdf"))  return TEXT("application/pdf");
	if (Ext == TEXT("zip"))  return TEXT("application/zip");
	if (Ext == TEXT("mp3"))  return TEXT("audio/mpeg");
	if (Ext == TEXT("mp4"))  return TEXT("video/mp4");
	if (Ext == TEXT("webm")) return TEXT("video/webm");
	if (Ext == TEXT("wav"))  return TEXT("audio/wav");
	if (Ext == TEXT("ogg"))  return TEXT("audio/ogg");
	if (Ext == TEXT("bin"))  return TEXT("application/octet-stream");
	return TEXT("application/octet-stream");
}

FString UKBVESupabaseStorage::GetObjectURL(const FString& Bucket, const FString& ObjectPath) const
{
	return FString::Printf(TEXT("%s/object/%s/%s"),
		*GetStorageBase(),
		*FGenericPlatformHttp::UrlEncode(Bucket),
		*EncodeObjectPath(ObjectPath));
}

FString UKBVESupabaseStorage::GetSignURL(const FString& Bucket, const FString& ObjectPath) const
{
	return FString::Printf(TEXT("%s/object/sign/%s/%s"),
		*GetStorageBase(),
		*FGenericPlatformHttp::UrlEncode(Bucket),
		*EncodeObjectPath(ObjectPath));
}

FString UKBVESupabaseStorage::GetListURL(const FString& Bucket) const
{
	return FString::Printf(TEXT("%s/object/list/%s"),
		*GetStorageBase(),
		*FGenericPlatformHttp::UrlEncode(Bucket));
}

FString UKBVESupabaseStorage::GetBucketURL(const FString& Bucket) const
{
	return FString::Printf(TEXT("%s/object/%s"),
		*GetStorageBase(),
		*FGenericPlatformHttp::UrlEncode(Bucket));
}

FString UKBVESupabaseStorage::GetPublicURL(const FString& Bucket, const FString& ObjectPath) const
{
	return FString::Printf(TEXT("%s/object/public/%s/%s"),
		*GetStorageBase(),
		*FGenericPlatformHttp::UrlEncode(Bucket),
		*EncodeObjectPath(ObjectPath));
}

void UKBVESupabaseStorage::UploadBytes(
	const FString& Bucket,
	const FString& ObjectPath,
	const TArray<uint8>& Bytes,
	const FString& ContentType,
	bool bUpsert,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	const FString URL = GetObjectURL(Bucket, ObjectPath);
	const FString ResolvedType = ContentType.IsEmpty() ? GuessContentType(ObjectPath) : ContentType;

	TMap<FString, FString> Headers;
	Headers.Add(TEXT("x-upsert"), bUpsert ? TEXT("true") : TEXT("false"));

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("POST"), URL, Bytes, ResolvedType, Headers,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}

void UKBVESupabaseStorage::UploadFile(
	const FString& Bucket,
	const FString& ObjectPath,
	const FString& LocalFilePath,
	const FString& ContentType,
	bool bUpsert,
	const FKBVESupabaseStringCallback& OnComplete)
{
	TArray<uint8> Bytes;
	if (!FFileHelper::LoadFileToArray(Bytes, *LocalFilePath))
	{
		OnComplete.ExecuteIfBound(false, FString::Printf(TEXT("Failed to read %s"), *LocalFilePath));
		return;
	}

	const FString ResolvedType = ContentType.IsEmpty() ? GuessContentType(LocalFilePath) : ContentType;
	UploadBytes(Bucket, ObjectPath, Bytes, ResolvedType, bUpsert, OnComplete);
}

void UKBVESupabaseStorage::Download(
	const FString& Bucket,
	const FString& ObjectPath,
	const FKBVESupabaseBytesCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TArray<uint8>());
		return;
	}

	const FString URL = GetObjectURL(Bucket, ObjectPath);
	const TArray<uint8> EmptyBody;
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseBytesCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("GET"), URL, EmptyBody, FString(), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, RespBytes);
		});
}

void UKBVESupabaseStorage::DownloadToFile(
	const FString& Bucket,
	const FString& ObjectPath,
	const FString& LocalFilePath,
	const FKBVESupabaseSimpleCallback& OnComplete)
{
	const FString TargetPath = LocalFilePath;
	FKBVESupabaseSimpleCallback Cb = OnComplete;

	FKBVESupabaseBytesCallback Inner;
	Inner.BindLambda([TargetPath, Cb](bool bSuccess, const TArray<uint8>& Bytes)
	{
		if (!bSuccess)
		{
			Cb.ExecuteIfBound(false);
			return;
		}
		IFileManager::Get().MakeDirectory(*FPaths::GetPath(TargetPath), true);
		const bool bWritten = FFileHelper::SaveArrayToFile(Bytes, *TargetPath);
		Cb.ExecuteIfBound(bWritten);
	});

	Download(Bucket, ObjectPath, Inner);
}

void UKBVESupabaseStorage::RemoveObjects(
	const FString& Bucket,
	const TArray<FString>& ObjectPaths,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	const FString Body = FString::Printf(TEXT("{\"prefixes\":%s}"), *JsonStringArray(ObjectPaths));
	TArray<uint8> BodyBytes;
	StringToBytes(Body, BodyBytes);

	const FString URL = GetBucketURL(Bucket);
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("DELETE"), URL, BodyBytes, TEXT("application/json"), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}

void UKBVESupabaseStorage::ListObjects(
	const FString& Bucket,
	const FString& Prefix,
	int32 Limit,
	int32 Offset,
	const FString& SortBy,
	const FString& SortOrder,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	const TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
	Root->SetStringField(TEXT("prefix"), Prefix);
	Root->SetNumberField(TEXT("limit"), Limit > 0 ? Limit : 100);
	Root->SetNumberField(TEXT("offset"), Offset > 0 ? Offset : 0);

	const TSharedPtr<FJsonObject> Sort = MakeShared<FJsonObject>();
	Sort->SetStringField(TEXT("column"), SortBy.IsEmpty() ? TEXT("name") : SortBy);
	Sort->SetStringField(TEXT("order"), SortOrder.IsEmpty() ? TEXT("asc") : SortOrder);
	Root->SetObjectField(TEXT("sortBy"), Sort);

	FString Body;
	const TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&Body);
	FJsonSerializer::Serialize(Root.ToSharedRef(), Writer);

	TArray<uint8> BodyBytes;
	StringToBytes(Body, BodyBytes);

	const FString URL = GetListURL(Bucket);
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("POST"), URL, BodyBytes, TEXT("application/json"), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}

void UKBVESupabaseStorage::CreateSignedURL(
	const FString& Bucket,
	const FString& ObjectPath,
	int32 ExpiresInSeconds,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	const int32 Expires = FMath::Max(1, ExpiresInSeconds);
	const FString Body = FString::Printf(TEXT("{\"expiresIn\":%d}"), Expires);

	TArray<uint8> BodyBytes;
	StringToBytes(Body, BodyBytes);

	const FString URL = GetSignURL(Bucket, ObjectPath);
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("POST"), URL, BodyBytes, TEXT("application/json"), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}

void UKBVESupabaseStorage::MoveObject(
	const FString& Bucket,
	const FString& FromPath,
	const FString& ToPath,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	FString EscFrom = FromPath; EscFrom.ReplaceInline(TEXT("\""), TEXT("\\\""));
	FString EscTo   = ToPath;   EscTo.ReplaceInline(TEXT("\""), TEXT("\\\""));
	FString EscBucket = Bucket; EscBucket.ReplaceInline(TEXT("\""), TEXT("\\\""));

	const FString Body = FString::Printf(
		TEXT("{\"bucketId\":\"%s\",\"sourceKey\":\"%s\",\"destinationKey\":\"%s\"}"),
		*EscBucket, *EscFrom, *EscTo);

	TArray<uint8> BodyBytes;
	StringToBytes(Body, BodyBytes);

	const FString URL = FString::Printf(TEXT("%s/object/move"), *GetStorageBase());
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("POST"), URL, BodyBytes, TEXT("application/json"), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}

void UKBVESupabaseStorage::CopyObject(
	const FString& Bucket,
	const FString& FromPath,
	const FString& ToPath,
	const FKBVESupabaseStringCallback& OnComplete)
{
	if (!Parent.IsValid())
	{
		OnComplete.ExecuteIfBound(false, TEXT("Supabase subsystem unavailable"));
		return;
	}

	FString EscFrom = FromPath; EscFrom.ReplaceInline(TEXT("\""), TEXT("\\\""));
	FString EscTo   = ToPath;   EscTo.ReplaceInline(TEXT("\""), TEXT("\\\""));
	FString EscBucket = Bucket; EscBucket.ReplaceInline(TEXT("\""), TEXT("\\\""));

	const FString Body = FString::Printf(
		TEXT("{\"bucketId\":\"%s\",\"sourceKey\":\"%s\",\"destinationKey\":\"%s\"}"),
		*EscBucket, *EscFrom, *EscTo);

	TArray<uint8> BodyBytes;
	StringToBytes(Body, BodyBytes);

	const FString URL = FString::Printf(TEXT("%s/object/copy"), *GetStorageBase());
	const TMap<FString, FString> NoHeaders;

	FKBVESupabaseStringCallback Cb = OnComplete;
	Parent->DispatchAuthedRequest(TEXT("POST"), URL, BodyBytes, TEXT("application/json"), NoHeaders,
		[Cb](bool bSuccess, int32 Status, const TArray<uint8>& RespBytes, FHttpResponsePtr)
		{
			Cb.ExecuteIfBound(bSuccess, BytesToString(RespBytes));
		});
}
