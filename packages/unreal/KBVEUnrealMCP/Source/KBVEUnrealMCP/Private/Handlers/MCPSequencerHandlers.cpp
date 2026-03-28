#include "Handlers/MCPSequencerHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPSequencerHandlers::Register(FMCPHandlerRegistry& Registry)
{
	// TODO: ChiR24 — sequencer/cinematics control
	Registry.RegisterHandler(TEXT("sequencer.create"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.create")));
	Registry.RegisterHandler(TEXT("sequencer.add_track"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.add_track")));
	Registry.RegisterHandler(TEXT("sequencer.add_keyframe"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.add_keyframe")));
	Registry.RegisterHandler(TEXT("sequencer.set_range"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.set_range")));
	Registry.RegisterHandler(TEXT("sequencer.play"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.play")));
	Registry.RegisterHandler(TEXT("sequencer.stop"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.stop")));
	Registry.RegisterHandler(TEXT("sequencer.get_info"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.get_info")));
	Registry.RegisterHandler(TEXT("sequencer.bind_actor"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.bind_actor")));
	Registry.RegisterHandler(TEXT("sequencer.add_camera_cut"), MCPProtocolHelpers::MakeStub(TEXT("sequencer.add_camera_cut")));
}
