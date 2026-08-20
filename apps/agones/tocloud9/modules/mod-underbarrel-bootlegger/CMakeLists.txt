#
# mod-bootlegger — AzerothCore module
#
# AzerothCore's modules/CMakeLists.txt auto-collects sources under src/ and
# registers this module when the folder is linked into the core's modules/ dir.
# Config: conf/mod_bootlegger.conf.dist
# World SQL: data/sql/db-world/mod_bootlegger.sql

cmake_minimum_required(VERSION 3.16)

message(STATUS "mod-bootlegger: configuring (C++14, sources under src/)")
