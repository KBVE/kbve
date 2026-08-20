#ifndef BOOTLEG_WORLD_SCRIPT_H
#define BOOTLEG_WORLD_SCRIPT_H

#include "ScriptMgr.h"

class BootlegWorldScript : public WorldScript
{
public:
    BootlegWorldScript();

    void OnAfterConfigLoad(bool reload) override;
};

#endif
