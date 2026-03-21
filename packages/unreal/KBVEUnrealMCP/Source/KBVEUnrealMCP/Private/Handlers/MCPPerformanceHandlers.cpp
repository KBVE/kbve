#include "Handlers/MCPPerformanceHandlers.h"
#include "Registry/MCPHandlerRegistry.h"
#include "HAL/PlatformMemory.h"
#include "GenericPlatform/GenericPlatformMemory.h"

void FMCPPerformanceHandlers::Register(FMCPHandlerRegistry& Registry)
{
	Registry.RegisterHandler(TEXT("performance.get_stats"), &HandleGetStats);
	Registry.RegisterHandler(TEXT("performance.profile_gpu"), &HandleProfileGpu);
	Registry.RegisterHandler(TEXT("performance.get_memory_info"), &HandleGetMemoryInfo);
}

void FMCPPerformanceHandlers::HandleGetStats(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("fps"), 1.0 / FApp::GetDeltaTime());
	Result->SetNumberField(TEXT("delta_time_ms"), FApp::GetDeltaTime() * 1000.0);
	Result->SetNumberField(TEXT("frame_number"), (double)GFrameNumber);
	Result->SetNumberField(TEXT("uptime_seconds"), FPlatformTime::Seconds());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPerformanceHandlers::HandleProfileGpu(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetStringField(TEXT("gpu_adapter"), GRHIAdapterName);
	Result->SetStringField(TEXT("rhi"), FApp::GetGraphicsRHI());
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}

void FMCPPerformanceHandlers::HandleGetMemoryInfo(const TSharedPtr<FJsonObject>& Params, FMCPResponseDelegate OnComplete)
{
	FPlatformMemoryStats MemStats = FPlatformMemory::GetStats();

	TSharedPtr<FJsonObject> Result = MCPProtocolHelpers::MakeResult();
	Result->SetNumberField(TEXT("used_physical_mb"), (double)MemStats.UsedPhysical / (1024.0 * 1024.0));
	Result->SetNumberField(TEXT("available_physical_mb"), (double)MemStats.AvailablePhysical / (1024.0 * 1024.0));
	Result->SetNumberField(TEXT("used_virtual_mb"), (double)MemStats.UsedVirtual / (1024.0 * 1024.0));
	Result->SetNumberField(TEXT("available_virtual_mb"), (double)MemStats.AvailableVirtual / (1024.0 * 1024.0));
	Result->SetNumberField(TEXT("peak_used_physical_mb"), (double)MemStats.PeakUsedPhysical / (1024.0 * 1024.0));
	MCPProtocolHelpers::Succeed(OnComplete, Result);
}
