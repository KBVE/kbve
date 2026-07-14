#include "KBVEUI.h"
#include "KBVEUIStyle.h"

void FKBVEUIModule::StartupModule()
{
	FKBVEUIStyle::Initialize();
}

void FKBVEUIModule::ShutdownModule()
{
	FKBVEUIStyle::Shutdown();
}

IMPLEMENT_MODULE(FKBVEUIModule, KBVEUI)
