#pragma once

#include "CoreMinimal.h"
#include "KBVESupabaseTypes.h"

/**
 * Disk-backed session persistence. JSON at:
 *   <Saved>/KBVESupabase/<ProjectSlug>.session.json
 *
 * Notes:
 *  - Anon key bears all auth gates server-side; the file holds only the user's
 *    refresh token + access token. Treat as user-secret regardless: write only
 *    to ProjectSavedDir, never to ProjectContentDir/StagedBuilds.
 *  - JSON is deliberately plain so OS-level FDE / user-account isolation is the
 *    trust boundary. Add at-rest encryption (DPAPI / Keychain) in a later pass
 *    if a target platform needs it.
 */
class KBVESUPABASE_API FKBVESupabaseSessionStore
{
public:
	static FString GetSessionFilePath(const FString& ProjectSlug);

	static bool Save(const FString& ProjectSlug, const FKBVESupabaseSession& Session);
	static bool Load(const FString& ProjectSlug, FKBVESupabaseSession& OutSession);
	static bool Clear(const FString& ProjectSlug);
};
