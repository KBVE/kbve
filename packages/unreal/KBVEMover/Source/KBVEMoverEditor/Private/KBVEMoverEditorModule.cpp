#include "Modules/ModuleManager.h"

// Nothing to do at load: this module exists only to expose editor-only engine
// calls to the asset pipeline. It still needs an implementation, or the plugin
// fails to load with "module could not be initialized successfully".
IMPLEMENT_MODULE(FDefaultModuleImpl, KBVEMoverEditor);
