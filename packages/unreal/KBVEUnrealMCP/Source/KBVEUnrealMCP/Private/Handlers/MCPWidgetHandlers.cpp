#include "Handlers/MCPWidgetHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPWidgetHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("widget.create"), MCPProtocolHelpers::MakeStub(TEXT("widget.create")));
	Registry.RegisterHandler(TEXT("widget.add_element"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_element")));
	Registry.RegisterHandler(TEXT("widget.bind_event"), MCPProtocolHelpers::MakeStub(TEXT("widget.bind_event")));
	Registry.RegisterHandler(TEXT("widget.set_property"), MCPProtocolHelpers::MakeStub(TEXT("widget.set_property")));
	Registry.RegisterHandler(TEXT("widget.add_to_viewport"), MCPProtocolHelpers::MakeStub(TEXT("widget.add_to_viewport")));
	Registry.RegisterHandler(TEXT("widget.remove"), MCPProtocolHelpers::MakeStub(TEXT("widget.remove")));
}
