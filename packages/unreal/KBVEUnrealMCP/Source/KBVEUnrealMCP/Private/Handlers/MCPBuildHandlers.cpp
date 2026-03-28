#include "Handlers/MCPBuildHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPBuildHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24 — UBT compilation and build pipeline
	Registry.RegisterHandler(TEXT("build.compile"), MCPProtocolHelpers::MakeStub(TEXT("build.compile")));
	Registry.RegisterHandler(TEXT("build.get_status"), MCPProtocolHelpers::MakeStub(TEXT("build.get_status")));
	Registry.RegisterHandler(TEXT("build.cook"), MCPProtocolHelpers::MakeStub(TEXT("build.cook")));
	Registry.RegisterHandler(TEXT("build.package"), MCPProtocolHelpers::MakeStub(TEXT("build.package")));
	Registry.RegisterHandler(TEXT("build.run_tests"), MCPProtocolHelpers::MakeStub(TEXT("build.run_tests")));
	Registry.RegisterHandler(TEXT("build.get_errors"), MCPProtocolHelpers::MakeStub(TEXT("build.get_errors")));
}
