#pragma once

#include "CoreMinimal.h"
#include "Modules/ModuleManager.h"

class FMCPWebSocketServer;
class FMCPHandlerRegistry;

class FKBVEUnrealMCPModule : public IModuleInterface
{
public:
	virtual void StartupModule() override;
	virtual void ShutdownModule() override;

	static FKBVEUnrealMCPModule& Get();
	static bool IsAvailable();

	FMCPHandlerRegistry& GetRegistry() { return *Registry; }

private:
	void RegisterAllHandlers();

	TUniquePtr<FMCPHandlerRegistry> Registry;
	TUniquePtr<FMCPWebSocketServer> Server;
};
