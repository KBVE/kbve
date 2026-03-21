#include "Handlers/MCPAnimationHandlers.h"
#include "Registry/MCPHandlerRegistry.h"

void FMCPAnimationHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("animation.create_anim_bp"), MCPProtocolHelpers::MakeStub(TEXT("animation.create_anim_bp")));
	Registry.RegisterHandler(TEXT("animation.add_state"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_state")));
	Registry.RegisterHandler(TEXT("animation.add_transition"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_transition")));
	Registry.RegisterHandler(TEXT("animation.set_sequence"), MCPProtocolHelpers::MakeStub(TEXT("animation.set_sequence")));
	Registry.RegisterHandler(TEXT("animation.get_tracks"), MCPProtocolHelpers::MakeStub(TEXT("animation.get_tracks")));
	Registry.RegisterHandler(TEXT("animation.add_notify"), MCPProtocolHelpers::MakeStub(TEXT("animation.add_notify")));
}
