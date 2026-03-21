#include "KBVEUnrealMCPSettings.h"

UKBVEUnrealMCPSettings::UKBVEUnrealMCPSettings()
	: Port(9777)
	, bAutoStartServer(true)
	, HeartbeatIntervalSeconds(30.0f)
	, bAllowPythonExecution(true)
	, bAllowConsoleCommands(true)
	, bRequireConfirmationForDestructive(false)
	, MaxRequestsPerSecond(60)
{
	ConsoleCommandDenylist.Add(TEXT("exit"));
	ConsoleCommandDenylist.Add(TEXT("quit"));
	ConsoleCommandDenylist.Add(TEXT("RestartEditor"));
	ConsoleCommandDenylist.Add(TEXT("crash"));
}

const UKBVEUnrealMCPSettings* UKBVEUnrealMCPSettings::Get()
{
	return GetDefault<UKBVEUnrealMCPSettings>();
}
