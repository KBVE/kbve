#include "Handlers/MCPPIEHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPPIEHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24+UnrealClaude — Play-In-Editor control
	Registry.RegisterHandler(TEXT("pie.play"), MCPProtocolHelpers::MakeStub(TEXT("pie.play")));
	Registry.RegisterHandler(TEXT("pie.stop"), MCPProtocolHelpers::MakeStub(TEXT("pie.stop")));
	Registry.RegisterHandler(TEXT("pie.pause"), MCPProtocolHelpers::MakeStub(TEXT("pie.pause")));
	Registry.RegisterHandler(TEXT("pie.resume"), MCPProtocolHelpers::MakeStub(TEXT("pie.resume")));
	Registry.RegisterHandler(TEXT("pie.eject"), MCPProtocolHelpers::MakeStub(TEXT("pie.eject")));
	Registry.RegisterHandler(TEXT("pie.possess"), MCPProtocolHelpers::MakeStub(TEXT("pie.possess")));
	Registry.RegisterHandler(TEXT("pie.set_game_speed"), MCPProtocolHelpers::MakeStub(TEXT("pie.set_game_speed")));
	Registry.RegisterHandler(TEXT("pie.step_frame"), MCPProtocolHelpers::MakeStub(TEXT("pie.step_frame")));
	Registry.RegisterHandler(TEXT("pie.is_playing"), MCPProtocolHelpers::MakeStub(TEXT("pie.is_playing")));
}
