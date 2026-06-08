#include "KBVEPostShaderModule.h"
#include "KBVEPostViewExtension.h"

#include "Interfaces/IPluginManager.h"
#include "Misc/Paths.h"
#include "SceneViewExtension.h"
#include "ShaderCore.h"

#define LOCTEXT_NAMESPACE "FKBVEPostShaderModule"

void FKBVEPostShaderModule::StartupModule()
{
	const TSharedPtr<IPlugin> Plugin = IPluginManager::Get().FindPlugin(TEXT("KBVEPostShader"));
	if (Plugin.IsValid())
	{
		const FString ShaderDir = FPaths::Combine(Plugin->GetBaseDir(), TEXT("Shaders"));
		AddShaderSourceDirectoryMapping(TEXT("/Plugin/KBVEPostShader"), ShaderDir);
	}

	ViewExtension = FSceneViewExtensions::NewExtension<FKBVEPostViewExtension>();
}

void FKBVEPostShaderModule::ShutdownModule()
{
	ViewExtension.Reset();
}

#undef LOCTEXT_NAMESPACE

IMPLEMENT_MODULE(FKBVEPostShaderModule, KBVEPostShader)
