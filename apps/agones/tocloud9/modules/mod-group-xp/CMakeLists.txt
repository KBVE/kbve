#
# mod-group-xp — AzerothCore module
#
# AzerothCore's modules/CMakeLists.txt auto-collects sources under src/ and
# registers this module when the folder is linked into the core's modules/ dir.
# Config: conf/mod_group_xp.conf.dist
# No SQL: this module only rescales kill XP at reward time.

cmake_minimum_required(VERSION 3.16)

message(STATUS "mod-group-xp: configuring (sources under src/)")
