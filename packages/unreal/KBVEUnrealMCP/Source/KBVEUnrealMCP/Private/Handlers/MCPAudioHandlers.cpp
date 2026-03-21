#include "Handlers/MCPAudioHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPAudioHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("audio.spawn_source"), MCPProtocolHelpers::MakeStub(TEXT("audio.spawn_source")));
	Registry.RegisterHandler(TEXT("audio.set_properties"), MCPProtocolHelpers::MakeStub(TEXT("audio.set_properties")));
	Registry.RegisterHandler(TEXT("audio.play"), MCPProtocolHelpers::MakeStub(TEXT("audio.play")));
	Registry.RegisterHandler(TEXT("audio.stop"), MCPProtocolHelpers::MakeStub(TEXT("audio.stop")));
	Registry.RegisterHandler(TEXT("audio.get_info"), MCPProtocolHelpers::MakeStub(TEXT("audio.get_info")));
}
