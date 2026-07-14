#pragma once

#include "CoreMinimal.h"
#include "KBVESQLiteConnection.h"

class KBVESQLITE_API FKBVESettingsStore
{
public:
	FKBVESettingsStore() = default;
	~FKBVESettingsStore();

	bool Open(const FString& DbPath);
	void Close();
	bool IsOpen() const;

	bool SetString(const FString& Scope, const FString& Key, const FString& Value);
	bool SetInt(const FString& Scope, const FString& Key, int64 Value);
	bool SetFloat(const FString& Scope, const FString& Key, double Value);
	bool SetBool(const FString& Scope, const FString& Key, bool Value);

	bool GetString(const FString& Scope, const FString& Key, FString& OutValue) const;
	bool GetInt(const FString& Scope, const FString& Key, int64& OutValue) const;
	bool GetFloat(const FString& Scope, const FString& Key, double& OutValue) const;
	bool GetBool(const FString& Scope, const FString& Key, bool& OutValue) const;

	bool RemoveKey(const FString& Scope, const FString& Key);
	bool LoadScope(const FString& Scope, TMap<FString, FString>& OutPairs) const;

private:
	bool EnsureSchema();

	TUniquePtr<FKBVESQLiteConnection> Conn;
};
