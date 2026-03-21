#include "Handlers/MCPSplineHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPSplineHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("spline.create"), MCPProtocolHelpers::MakeStub(TEXT("spline.create")));
	Registry.RegisterHandler(TEXT("spline.add_point"), MCPProtocolHelpers::MakeStub(TEXT("spline.add_point")));
	Registry.RegisterHandler(TEXT("spline.set_properties"), MCPProtocolHelpers::MakeStub(TEXT("spline.set_properties")));
	Registry.RegisterHandler(TEXT("spline.get_info"), MCPProtocolHelpers::MakeStub(TEXT("spline.get_info")));
}
