#include "KBVEWebSurface.h"

#define LOCTEXT_NAMESPACE "FKBVEWebSurfaceModule"

DEFINE_LOG_CATEGORY(LogKBVEWebSurface);

void FKBVEWebSurfaceModule::StartupModule()
{
}

void FKBVEWebSurfaceModule::ShutdownModule()
{
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVEWebSurfaceModule, KBVEWebSurface)
