#include "KBVESettingsStore.h"

#include "KBVESQLiteConnection.h"

FKBVESettingsStore::~FKBVESettingsStore()
{
	Close();
}

bool FKBVESettingsStore::IsOpen() const
{
	return Conn.IsValid() && Conn->IsOpen();
}

bool FKBVESettingsStore::Open(const FString& DbPath)
{
	Close();
	Conn = MakeUnique<FKBVESQLiteConnection>();
	if (!Conn->Open(DbPath))
	{
		Conn.Reset();
		return false;
	}
	if (!EnsureSchema())
	{
		Close();
		return false;
	}
	return true;
}

void FKBVESettingsStore::Close()
{
	if (Conn.IsValid())
	{
		Conn->Close();
		Conn.Reset();
	}
}

bool FKBVESettingsStore::EnsureSchema()
{
	return Conn->Exec(
		"CREATE TABLE IF NOT EXISTS kv_settings ("
		"scope TEXT NOT NULL,"
		"key TEXT NOT NULL,"
		"value TEXT NOT NULL,"
		"PRIMARY KEY (scope, key));");
}

bool FKBVESettingsStore::SetString(const FString& Scope, const FString& Key, const FString& Value)
{
	if (!IsOpen()) return false;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn->Prepare(
		"INSERT INTO kv_settings (scope, key, value) VALUES (?1, ?2, ?3) "
		"ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value;");
	if (!Stmt.IsValid()) return false;
	Stmt->BindText(1, Scope);
	Stmt->BindText(2, Key);
	Stmt->BindText(3, Value);
	return Stmt->Execute();
}

bool FKBVESettingsStore::SetInt(const FString& Scope, const FString& Key, int64 Value)
{
	return SetString(Scope, Key, LexToString(Value));
}

bool FKBVESettingsStore::SetFloat(const FString& Scope, const FString& Key, double Value)
{
	return SetString(Scope, Key, LexToString(Value));
}

bool FKBVESettingsStore::SetBool(const FString& Scope, const FString& Key, bool Value)
{
	return SetString(Scope, Key, Value ? TEXT("1") : TEXT("0"));
}

bool FKBVESettingsStore::GetString(const FString& Scope, const FString& Key, FString& OutValue) const
{
	if (!IsOpen()) return false;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn->Prepare(
		"SELECT value FROM kv_settings WHERE scope = ?1 AND key = ?2;");
	if (!Stmt.IsValid()) return false;
	Stmt->BindText(1, Scope);
	Stmt->BindText(2, Key);
	if (!Stmt->Step()) return false;
	OutValue = Stmt->ColumnText(0);
	return true;
}

bool FKBVESettingsStore::GetInt(const FString& Scope, const FString& Key, int64& OutValue) const
{
	FString Raw;
	if (!GetString(Scope, Key, Raw)) return false;
	OutValue = FCString::Atoi64(*Raw);
	return true;
}

bool FKBVESettingsStore::GetFloat(const FString& Scope, const FString& Key, double& OutValue) const
{
	FString Raw;
	if (!GetString(Scope, Key, Raw)) return false;
	OutValue = FCString::Atod(*Raw);
	return true;
}

bool FKBVESettingsStore::GetBool(const FString& Scope, const FString& Key, bool& OutValue) const
{
	FString Raw;
	if (!GetString(Scope, Key, Raw)) return false;
	OutValue = Raw == TEXT("1") || Raw.ToBool();
	return true;
}

bool FKBVESettingsStore::RemoveKey(const FString& Scope, const FString& Key)
{
	if (!IsOpen()) return false;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn->Prepare(
		"DELETE FROM kv_settings WHERE scope = ?1 AND key = ?2;");
	if (!Stmt.IsValid()) return false;
	Stmt->BindText(1, Scope);
	Stmt->BindText(2, Key);
	return Stmt->Execute();
}

bool FKBVESettingsStore::LoadScope(const FString& Scope, TMap<FString, FString>& OutPairs) const
{
	if (!IsOpen()) return false;
	TSharedPtr<FKBVESQLiteStatement> Stmt = Conn->Prepare(
		"SELECT key, value FROM kv_settings WHERE scope = ?1;");
	if (!Stmt.IsValid()) return false;
	Stmt->BindText(1, Scope);
	while (Stmt->Step())
	{
		OutPairs.Add(Stmt->ColumnText(0), Stmt->ColumnText(1));
	}
	return true;
}
