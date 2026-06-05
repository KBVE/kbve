#pragma once

#include "CoreMinimal.h"
#include "UObject/Object.h"
#include "KBVESupabaseTypes.h"
#include "KBVESupabaseStorage.generated.h"

class UKBVESupabaseSubsystem;

/**
 * Supabase Storage v1 wrapper. Accessed via
 * `GetGameInstance()->GetSubsystem<UKBVESupabaseSubsystem>()->GetStorage()`.
 *
 * All authed by default — RLS + bucket policy on the server decide
 * whether the call is allowed. For unauthenticated reads from a
 * public bucket, use GetPublicURL() and an external HTTP fetch.
 */
UCLASS(BlueprintType)
class KBVESUPABASE_API UKBVESupabaseStorage : public UObject
{
	GENERATED_BODY()

public:
	void Init(UKBVESupabaseSubsystem* InParent);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage",
		meta = (AutoCreateRefTerm = "Bytes", AdvancedDisplay = "ContentType,bUpsert"))
	void UploadBytes(
		const FString& Bucket,
		const FString& ObjectPath,
		const TArray<uint8>& Bytes,
		const FString& ContentType,
		bool bUpsert,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage",
		meta = (AdvancedDisplay = "ContentType,bUpsert"))
	void UploadFile(
		const FString& Bucket,
		const FString& ObjectPath,
		const FString& LocalFilePath,
		const FString& ContentType,
		bool bUpsert,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage")
	void Download(
		const FString& Bucket,
		const FString& ObjectPath,
		const FKBVESupabaseBytesCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage")
	void DownloadToFile(
		const FString& Bucket,
		const FString& ObjectPath,
		const FString& LocalFilePath,
		const FKBVESupabaseSimpleCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage",
		meta = (AutoCreateRefTerm = "ObjectPaths"))
	void RemoveObjects(
		const FString& Bucket,
		const TArray<FString>& ObjectPaths,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage",
		meta = (AdvancedDisplay = "Limit,Offset,SortBy,SortOrder"))
	void ListObjects(
		const FString& Bucket,
		const FString& Prefix,
		int32 Limit,
		int32 Offset,
		const FString& SortBy,
		const FString& SortOrder,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage")
	void CreateSignedURL(
		const FString& Bucket,
		const FString& ObjectPath,
		int32 ExpiresInSeconds,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage")
	void MoveObject(
		const FString& Bucket,
		const FString& FromPath,
		const FString& ToPath,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintCallable, Category = "KBVE|Supabase|Storage")
	void CopyObject(
		const FString& Bucket,
		const FString& FromPath,
		const FString& ToPath,
		const FKBVESupabaseStringCallback& OnComplete);

	UFUNCTION(BlueprintPure, Category = "KBVE|Supabase|Storage")
	FString GetPublicURL(const FString& Bucket, const FString& ObjectPath) const;

protected:
	UPROPERTY(Transient)
	TWeakObjectPtr<UKBVESupabaseSubsystem> Parent;

	FString GetObjectURL(const FString& Bucket, const FString& ObjectPath) const;
	FString GetSignURL(const FString& Bucket, const FString& ObjectPath) const;
	FString GetListURL(const FString& Bucket) const;
	FString GetBucketURL(const FString& Bucket) const;
	FString GetStorageBase() const;

	static FString EncodeObjectPath(const FString& InPath);
	static FString GuessContentType(const FString& InPathOrName);
};
