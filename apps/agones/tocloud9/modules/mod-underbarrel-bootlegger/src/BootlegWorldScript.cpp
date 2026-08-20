#include "BootlegWorldScript.h"

#include "BootlegConfig.h"

BootlegWorldScript::BootlegWorldScript()
    : WorldScript("BootlegWorldScript")
{
}

void BootlegWorldScript::OnAfterConfigLoad(bool /*reload*/)
{
    BootlegConfig::instance().Load();
}
