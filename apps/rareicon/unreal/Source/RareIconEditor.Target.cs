using UnrealBuildTool;
using System.Collections.Generic;

public class RareIconEditorTarget : TargetRules
{
	public RareIconEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Unreal5_8;
		ExtraModuleNames.Add("RareIcon");
	}
}
