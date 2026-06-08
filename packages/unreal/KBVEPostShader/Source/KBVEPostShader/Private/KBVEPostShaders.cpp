#include "KBVEPostShaders.h"

IMPLEMENT_GLOBAL_SHADER(FKBVEPostStructureTensorPS, "/Plugin/KBVEPostShader/Private/KBVEPostStructureTensor.usf", "MainPS", SF_Pixel);
IMPLEMENT_GLOBAL_SHADER(FKBVEPostKuwaharaPS, "/Plugin/KBVEPostShader/Private/KBVEPostKuwahara.usf", "MainPS", SF_Pixel);
IMPLEMENT_GLOBAL_SHADER(FKBVEPostCompositePS, "/Plugin/KBVEPostShader/Private/KBVEPostComposite.usf", "MainPS", SF_Pixel);
