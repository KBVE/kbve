#include "Handlers/MCPCodeAnalysisHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPCodeAnalysisHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("codeanalysis.analyze_class"), MCPProtocolHelpers::MakeStub(TEXT("codeanalysis.analyze_class")));
	Registry.RegisterHandler(TEXT("codeanalysis.find_references"), MCPProtocolHelpers::MakeStub(TEXT("codeanalysis.find_references")));
	Registry.RegisterHandler(TEXT("codeanalysis.search_code"), MCPProtocolHelpers::MakeStub(TEXT("codeanalysis.search_code")));
	Registry.RegisterHandler(TEXT("codeanalysis.get_hierarchy"), MCPProtocolHelpers::MakeStub(TEXT("codeanalysis.get_hierarchy")));
}
