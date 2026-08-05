import json
import os
import subprocess
import sys
import tempfile

from save_intel import decompress_sav, find_level_sav, snapshot_once

GUILD_ID = "11111111-2222-3333-4444-555555555555"
BASE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
PLAYER_UID = "99999999-8888-7777-6666-555555555555"
CONTAINER_ID = "cccccccc-1111-2222-3333-444444444444"
PAL_INSTANCE_ID = "dddddddd-5555-6666-7777-888888888888"

HEADER = {
    "magic": 0x53415647,
    "save_game_version": 3,
    "package_file_version_ue4": 522,
    "package_file_version_ue5": 1008,
    "engine_version_major": 5,
    "engine_version_minor": 1,
    "engine_version_patch": 1,
    "engine_version_changelist": 0,
    "engine_version_branch": "++UE5+Release-5.1",
    "custom_version_format": 3,
    "custom_versions": [],
    "save_game_class_name": "/Script/Pal.PalWorldSaveGame",
}


def transform(x, y, z):
    return {
        "rotation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
        "translation": {"x": x, "y": y, "z": z},
        "scale3d": {"x": 1.0, "y": 1.0, "z": 1.0},
    }


def build_fixture_sav(path, save_type=0x32):
    from palsav.core import compress_gvas_to_sav
    from palsav.gvas import GvasFile
    from palsav.paltypes import PALWORLD_CUSTOM_PROPERTIES

    properties = {
        "worldSaveData": {
            "type": "StructProperty",
            "struct_type": "PalWorldSaveData",
            "struct_id": "00000000-0000-0000-0000-000000000000",
            "id": None,
            "value": {
                "GroupSaveDataMap": {
                    "type": "MapProperty",
                    "custom_type": ".worldSaveData.GroupSaveDataMap",
                    "key_type": "StructProperty",
                    "value_type": "StructProperty",
                    "key_struct_type": "Guid",
                    "value_struct_type": "PalGroupSaveDataMapStruct",
                    "id": None,
                    "value": [
                        {
                            "key": GUILD_ID,
                            "value": {
                                "GroupType": {
                                    "type": "EnumProperty",
                                    "value": {
                                        "type": "EPalGroupType",
                                        "value": "EPalGroupType::Guild",
                                    },
                                    "id": None,
                                },
                                "RawData": {
                                    "type": "ArrayProperty",
                                    "array_type": "ByteProperty",
                                    "id": None,
                                    "value": {
                                        "group_type": "EPalGroupType::Guild",
                                        "group_id": GUILD_ID,
                                        "group_name": "test",
                                        "individual_character_handle_ids": [
                                            {
                                                "guid": PLAYER_UID,
                                                "instance_id": BASE_ID,
                                            }
                                        ],
                                        "org_type": 0,
                                        "leading_bytes": [0, 0, 0, 0],
                                        "base_ids": [BASE_ID],
                                        "unknown_1": 0,
                                        "base_camp_level": 7,
                                        "map_object_instance_ids_base_camp_points": [],
                                        "guild_name": "KBVE-E2E",
                                        "last_guild_name_modifier_player_uid": PLAYER_UID,
                                        "guild_markers": [],
                                        "admin_player_uid": PLAYER_UID,
                                        "players": [
                                            {
                                                "player_uid": PLAYER_UID,
                                                "player_info": {
                                                    "last_online_real_time": 638,
                                                    "player_name": "h0lybyte",
                                                },
                                            }
                                        ],
                                        "trailing_bytes": [0, 0, 0, 0],
                                    },
                                },
                            },
                        }
                    ],
                },
                "BaseCampSaveData": {
                    "type": "MapProperty",
                    "key_type": "StructProperty",
                    "value_type": "StructProperty",
                    "key_struct_type": "Guid",
                    "value_struct_type": "PalBaseCampSaveData",
                    "id": None,
                    "value": [
                        {
                            "key": BASE_ID,
                            "value": {
                                "RawData": {
                                    "type": "ArrayProperty",
                                    "array_type": "ByteProperty",
                                    "custom_type": ".worldSaveData.BaseCampSaveData.Value.RawData",
                                    "id": None,
                                    "value": {
                                        "id": BASE_ID,
                                        "name": "",
                                        "state": 0,
                                        "transform": transform(
                                            -92930.7, 17885.2, 5000.0
                                        ),
                                        "area_range": 2700.0,
                                        "group_id_belong_to": GUILD_ID,
                                        "fast_travel_local_transform": transform(
                                            0.0, 0.0, 0.0
                                        ),
                                        "owner_map_object_instance_id": BASE_ID,
                                        "trailing_bytes": [0, 0, 0, 0],
                                    },
                                },
                                "WorkerDirector": {
                                    "type": "StructProperty",
                                    "struct_type": "PalBaseCampWorkerDirectorSaveData",
                                    "struct_id": "00000000-0000-0000-0000-000000000000",
                                    "id": None,
                                    "value": {
                                        "RawData": {
                                            "type": "ArrayProperty",
                                            "array_type": "ByteProperty",
                                            "custom_type": ".worldSaveData.BaseCampSaveData.Value.WorkerDirector.RawData",
                                            "id": None,
                                            "value": {
                                                "id": BASE_ID,
                                                "spawn_transform": transform(
                                                    0.0, 0.0, 0.0
                                                ),
                                                "current_order_type": 0,
                                                "current_battle_type": 0,
                                                "container_id": CONTAINER_ID,
                                                "trailing_bytes": [0, 0, 0, 0],
                                            },
                                        }
                                    },
                                },
                            },
                        }
                    ],
                },
                "CharacterContainerSaveData": {
                    "type": "MapProperty",
                    "key_type": "StructProperty",
                    "value_type": "StructProperty",
                    "key_struct_type": "StructProperty",
                    "value_struct_type": "StructProperty",
                    "id": None,
                    "value": [
                        {
                            "key": {
                                "ID": {
                                    "type": "StructProperty",
                                    "struct_type": "Guid",
                                    "struct_id": "00000000-0000-0000-0000-000000000000",
                                    "id": None,
                                    "value": CONTAINER_ID,
                                }
                            },
                            "value": {
                                "Slots": {
                                    "type": "ArrayProperty",
                                    "array_type": "StructProperty",
                                    "id": None,
                                    "value": {
                                        "prop_name": "Slots",
                                        "prop_type": "StructProperty",
                                        "type_name": "PalCharacterSlotSaveData",
                                        "id": "00000000-0000-0000-0000-000000000000",
                                        "values": [
                                            {
                                                "RawData": {
                                                    "type": "ArrayProperty",
                                                    "array_type": "ByteProperty",
                                                    "custom_type": ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
                                                    "id": None,
                                                    "value": {
                                                        "player_uid": "00000000-0000-0000-0000-000000000000",
                                                        "instance_id": PAL_INSTANCE_ID,
                                                        "permission_tribe_id": 0,
                                                    },
                                                }
                                            }
                                        ],
                                    },
                                }
                            },
                        }
                    ],
                },
                "CharacterSaveParameterMap": {
                    "type": "MapProperty",
                    "key_type": "StructProperty",
                    "value_type": "StructProperty",
                    "key_struct_type": "StructProperty",
                    "value_struct_type": "StructProperty",
                    "id": None,
                    "value": [
                        {
                            "key": {
                                "PlayerUId": {
                                    "type": "StructProperty",
                                    "struct_type": "Guid",
                                    "struct_id": "00000000-0000-0000-0000-000000000000",
                                    "id": None,
                                    "value": "00000000-0000-0000-0000-000000000000",
                                },
                                "InstanceId": {
                                    "type": "StructProperty",
                                    "struct_type": "Guid",
                                    "struct_id": "00000000-0000-0000-0000-000000000000",
                                    "id": None,
                                    "value": PAL_INSTANCE_ID,
                                },
                            },
                            "value": {
                                "RawData": {
                                    "type": "ArrayProperty",
                                    "array_type": "ByteProperty",
                                    "custom_type": ".worldSaveData.CharacterSaveParameterMap.Value.RawData",
                                    "id": None,
                                    "value": {
                                        "object": {
                                            "SaveParameter": {
                                                "type": "StructProperty",
                                                "struct_type": "PalIndividualCharacterSaveParameter",
                                                "struct_id": "00000000-0000-0000-0000-000000000000",
                                                "id": None,
                                                "value": {
                                                    "CharacterID": {
                                                        "type": "NameProperty",
                                                        "id": None,
                                                        "value": "SheepBall",
                                                    },
                                                    "NickName": {
                                                        "type": "StrProperty",
                                                        "id": None,
                                                        "value": "Wooly",
                                                    },
                                                    "Level": {
                                                        "type": "IntProperty",
                                                        "id": None,
                                                        "value": 12,
                                                    },
                                                },
                                            }
                                        },
                                        "unknown_bytes": [0, 0, 0, 0],
                                        "group_id": GUILD_ID,
                                        "trailing_bytes": [0, 0, 0, 0],
                                    },
                                }
                            },
                        }
                    ],
                },
            },
        }
    }
    gvas = GvasFile.load(
        {"header": HEADER, "properties": properties, "trailer": "AAAAAA=="}
    )
    sav = compress_gvas_to_sav(gvas.write(PALWORLD_CUSTOM_PROPERTIES), save_type)
    with open(path, "wb") as f:
        f.write(sav)
    return sav


def expect(cond, label):
    if not cond:
        print(f"FAIL: {label}", file=sys.stderr)
        sys.exit(1)
    print(f"ok: {label}")


def main():
    workdir = tempfile.mkdtemp(prefix="savetool-e2e-")
    nested = os.path.join(workdir, "SaveGames", "0", "world")
    os.makedirs(nested)
    sav_path = os.path.join(nested, "Level.sav")
    build_fixture_sav(sav_path)

    expect(
        find_level_sav(os.path.join(workdir, "SaveGames")) == sav_path,
        "find_level_sav locates nested Level.sav",
    )

    out_path = os.path.join(workdir, "bases.json")
    snap = snapshot_once(sav_path, out_path)
    expect(snap["guild_count"] == 1, "one guild extracted")
    expect(snap["guilds"][0]["name"] == "KBVE-E2E", "guild name")
    expect(snap["guilds"][0]["base_camp_level"] == 7, "camp level")
    expect(snap["guilds"][0]["pal_handles"] == 1, "pal handle count")
    base = snap["guilds"][0]["bases"][0]
    expect(abs(base["x"] - -92930.7) < 0.01, "base x coordinate")
    expect(abs(base["y"] - 17885.2) < 0.01, "base y coordinate")
    roster = snap["guilds"][0]["players"]
    expect(
        roster == [{"uid": PLAYER_UID, "name": "h0lybyte", "last_online": 638}],
        "player roster",
    )
    pals = base["pals"]
    expect(
        pals == [{"id": "SheepBall", "name": "Wooly", "level": 12}],
        "base pal roster resolved via worker director container",
    )
    with open(out_path) as f:
        disk = json.load(f)
    expect(disk["guilds"][0]["id"] == GUILD_ID, "atomic JSON written to disk")

    cli = subprocess.run(
        [sys.executable, "save_intel.py", "--sav", sav_path, "--out", "-"],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.abspath(__file__)),
    )
    expect(cli.returncode == 0, "CLI exits 0")
    expect(
        json.loads(cli.stdout)["guilds"][0]["name"] == "KBVE-E2E",
        "CLI stdout JSON",
    )

    plm_path = os.path.join(nested, "LevelPlM.sav")
    plm_bytes = build_fixture_sav(plm_path, save_type=0x31)
    expect(plm_bytes[8:11] == b"PlM", "PlM fixture uses oodle container")
    plm_snap = snapshot_once(plm_path, os.path.join(workdir, "plm.json"))
    expect(
        plm_snap["guilds"][0]["name"] == "KBVE-E2E",
        "PlM oodle round-trip extracts guild",
    )
    expect(
        abs(plm_snap["guilds"][0]["bases"][0]["x"] - -92930.7) < 0.01,
        "PlM base coordinates",
    )

    try:
        decompress_sav(b"\x00" * 8 + b"PlQ\x31rest")
        expect(False, "unknown magic rejected")
    except Exception:
        expect(True, "unknown magic rejected")

    import save_intel

    dir_out = os.path.join(workdir, "dir-mode.json")
    sys.argv = [
        "save_intel.py",
        "--save-dir",
        os.path.join(workdir, "SaveGames"),
        "--out",
        dir_out,
    ]
    save_intel.main()
    with open(dir_out) as f:
        expect(
            json.load(f)["guilds"][0]["name"] == "KBVE-E2E",
            "--save-dir CLI mode resolves newest sav",
        )

    print("e2e: all checks passed")


if __name__ == "__main__":
    main()
