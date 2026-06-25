#include "KBVESupabaseModule.h"
#include "KBVESupabaseDeepLink.h"

DEFINE_LOG_CATEGORY(LogKBVESupabase);

#define LOCTEXT_NAMESPACE "FKBVESupabaseModule"

void FKBVESupabaseModule::StartupModule()
{
	FKBVESupabaseDeepLink::RegisterHandlers();
}

void FKBVESupabaseModule::ShutdownModule()
{
	FKBVESupabaseDeepLink::UnregisterHandlers();
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVESupabaseModule, KBVESupabase)
