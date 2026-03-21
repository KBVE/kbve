#pragma once

#include "CoreMinimal.h"
#include "Engine/DeveloperSettings.h"
#include "KBVEUnrealMCPSettings.generated.h"

UCLASS(config = KBVEUnrealMCP, defaultconfig, meta = (DisplayName = "KBVE Unreal MCP"))
class KBVEUNREALMCP_API UKBVEUnrealMCPSettings : public UDeveloperSettings
{
	GENERATED_BODY()

public:
	UKBVEUnrealMCPSettings();

	UPROPERTY(config, EditAnywhere, Category = "Server", meta = (ClampMin = "1024", ClampMax = "65535"))
	int32 Port;

	UPROPERTY(config, EditAnywhere, Category = "Server")
	bool bAutoStartServer;

	UPROPERTY(config, EditAnywhere, Category = "Server", meta = (ClampMin = "5.0", ClampMax = "300.0"))
	float HeartbeatIntervalSeconds;

	UPROPERTY(config, EditAnywhere, Category = "Safety")
	bool bAllowPythonExecution;

	UPROPERTY(config, EditAnywhere, Category = "Safety")
	bool bAllowConsoleCommands;

	UPROPERTY(config, EditAnywhere, Category = "Safety")
	TArray<FString> ConsoleCommandDenylist;

	UPROPERTY(config, EditAnywhere, Category = "Safety")
	bool bRequireConfirmationForDestructive;

	UPROPERTY(config, EditAnywhere, Category = "Safety", meta = (ClampMin = "1", ClampMax = "1000"))
	int32 MaxRequestsPerSecond;

	static const UKBVEUnrealMCPSettings* Get();
};
