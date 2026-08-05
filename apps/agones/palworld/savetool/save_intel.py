import argparse
import json
import os
import shutil
import sys
import tempfile
import time

WANTED_PROPERTIES = (
    ".worldSaveData.GroupSaveDataMap",
    ".worldSaveData.BaseCampSaveData.Value.RawData",
    ".worldSaveData.BaseCampSaveData.Value.WorkerDirector.RawData",
    ".worldSaveData.CharacterContainerSaveData.Value.Slots.Slots.RawData",
)

MAX_BASE_PALS = 60


def pv(node, *keys):
    for key in keys:
        if not isinstance(node, dict):
            return None
        node = node.get(key)
        while isinstance(node, dict) and "value" in node:
            node = node["value"]
    return node


def decompress_sav(data):
    from palsav.core import decompress_sav_to_gvas

    raw, _ = decompress_sav_to_gvas(data)
    return raw


def parse_sav(path):
    from palsav.gvas import GvasFile
    from palsav.paltypes import (
        PALWORLD_CUSTOM_PROPERTIES,
        PALWORLD_TYPE_HINTS,
    )

    custom = {
        k: v for k, v in PALWORLD_CUSTOM_PROPERTIES.items() if k in WANTED_PROPERTIES
    }
    with open(path, "rb") as f:
        data = f.read()
    raw_gvas = decompress_sav(data)
    gvas = GvasFile.read(raw_gvas, PALWORLD_TYPE_HINTS, custom, allow_nan=True)
    return gvas.properties


def decode_character(raw_bytes):
    from palsav.archive import FArchiveReader
    from palsav.paltypes import PALWORLD_TYPE_HINTS
    from palsav.rawdata import character

    parent = FArchiveReader(b"", PALWORLD_TYPE_HINTS, {})
    data = character.decode_bytes(parent, raw_bytes) or {}
    sp = pv(data.get("object") or {}, "SaveParameter") or {}
    if pv(sp, "IsPlayer"):
        return None
    char_id = pv(sp, "CharacterID") or ""
    if not char_id:
        return None
    gender = str(pv(sp, "Gender") or "")
    passives_prop = pv(sp, "PassiveSkillList")
    passives = (
        passives_prop.get("values")
        if isinstance(passives_prop, dict)
        else passives_prop
    ) or []
    return {
        "id": str(char_id),
        "name": pv(sp, "NickName") or "",
        "level": pv(sp, "Level") or 1,
        "gender": "F" if "Female" in gender else "M" if "Male" in gender else "",
        "rank": pv(sp, "Rank") or 1,
        "talents": {
            "hp": pv(sp, "Talent_HP") or 0,
            "attack": pv(sp, "Talent_Shot") or 0,
            "defense": pv(sp, "Talent_Defense") or 0,
        },
        "passives": [str(p) for p in passives],
    }


def container_slot_instances(world):
    containers = pv(world, "CharacterContainerSaveData") or []
    by_container = {}
    for entry in containers:
        key_id = pv(entry.get("key"), "ID")
        if not key_id:
            continue
        slots_prop = pv(entry.get("value"), "Slots")
        slots = (
            slots_prop.get("values")
            if isinstance(slots_prop, dict)
            else slots_prop
        ) or []
        instances = []
        for slot in slots:
            raw = pv(slot, "RawData")
            inst = raw.get("instance_id") if isinstance(raw, dict) else None
            if inst:
                instances.append(str(inst))
        by_container[str(key_id)] = instances
    return by_container


def character_bytes_by_instance(world):
    chars = pv(world, "CharacterSaveParameterMap") or []
    by_instance = {}
    for entry in chars:
        inst = pv(entry.get("key"), "InstanceId")
        raw = pv(entry.get("value"), "RawData")
        values = raw.get("values") if isinstance(raw, dict) else None
        if inst and values:
            by_instance[str(inst)] = values
    return by_instance


def resolve_base_pals(camp_value, containers, char_bytes):
    director = pv(camp_value, "WorkerDirector", "RawData") or {}
    container_id = str(director.get("container_id") or "")
    pals = []
    for inst in containers.get(container_id, [])[:MAX_BASE_PALS]:
        raw = char_bytes.get(inst)
        if not raw:
            continue
        try:
            pal = decode_character(raw)
        except Exception:
            continue
        if pal:
            pals.append(pal)
    return pals


def extract_guilds(properties):
    world = pv(properties, "worldSaveData") or {}
    groups = pv(world, "GroupSaveDataMap") or []
    camps = pv(world, "BaseCampSaveData") or []
    containers = container_slot_instances(world)
    char_bytes = character_bytes_by_instance(world)

    camp_by_id = {}
    for entry in camps:
        raw = pv(entry.get("value"), "RawData") or {}
        camp_id = raw.get("id")
        if not camp_id:
            continue
        translation = (raw.get("transform") or {}).get("translation") or {}
        camp_by_id[str(camp_id)] = {
            "id": str(camp_id),
            "name": raw.get("name") or "",
            "group_id": str(raw.get("group_id_belong_to") or ""),
            "x": translation.get("x", 0.0),
            "y": translation.get("y", 0.0),
            "z": translation.get("z", 0.0),
            "pals": resolve_base_pals(
                entry.get("value") or {}, containers, char_bytes
            ),
        }

    guilds = []
    for entry in groups:
        value = entry.get("value") or {}
        group_type = pv(value, "GroupType")
        if group_type != "EPalGroupType::Guild":
            continue
        raw = pv(value, "RawData") or {}
        group_id = str(raw.get("group_id") or entry.get("key") or "")
        players = []
        for p in raw.get("players") or []:
            info = p.get("player_info") or {}
            players.append(
                {
                    "uid": str(p.get("player_uid") or ""),
                    "name": info.get("player_name") or "",
                    "last_online": info.get("last_online_real_time"),
                }
            )
        bases = []
        for base_id in raw.get("base_ids") or []:
            camp = camp_by_id.get(str(base_id))
            if camp:
                bases.append(camp)
        for camp in camp_by_id.values():
            if camp["group_id"] == group_id and camp not in bases:
                bases.append(camp)
        guilds.append(
            {
                "id": group_id,
                "name": raw.get("guild_name") or raw.get("group_name") or "",
                "admin_uid": str(raw.get("admin_player_uid") or ""),
                "base_camp_level": raw.get("base_camp_level"),
                "players": players,
                "bases": bases,
                "pal_handles": len(raw.get("individual_character_handle_ids") or []),
            }
        )
    return guilds


def build_snapshot(sav_path):
    properties = parse_sav(sav_path)
    guilds = extract_guilds(properties)
    return {
        "ts": int(time.time() * 1000),
        "save_mtime": int(os.path.getmtime(sav_path) * 1000),
        "guild_count": len(guilds),
        "base_count": sum(len(g["bases"]) for g in guilds),
        "guilds": guilds,
    }


def find_level_sav(root):
    newest = None
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            if name == "Level.sav":
                path = os.path.join(dirpath, name)
                mtime = os.path.getmtime(path)
                if newest is None or mtime > newest[0]:
                    newest = (mtime, path)
    return newest[1] if newest else None


def snapshot_once(sav_path, out_path):
    with tempfile.NamedTemporaryFile(suffix=".sav", delete=False) as tmp:
        tmp_sav = tmp.name
    try:
        shutil.copyfile(sav_path, tmp_sav)
        snap = build_snapshot(tmp_sav)
        snap["save_mtime"] = int(os.path.getmtime(sav_path) * 1000)
    finally:
        os.unlink(tmp_sav)
    if out_path == "-":
        json.dump(snap, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return snap
    tmp_out = out_path + ".tmp"
    with open(tmp_out, "w") as f:
        json.dump(snap, f, separators=(",", ":"))
    os.replace(tmp_out, out_path)
    return snap


def main():
    parser = argparse.ArgumentParser(description="Palworld save intel extractor")
    parser.add_argument("--sav", help="path to Level.sav")
    parser.add_argument("--save-dir", help="directory to scan for newest Level.sav")
    parser.add_argument("--out", default="-", help="output JSON path or - for stdout")
    parser.add_argument("--loop", action="store_true")
    parser.add_argument("--interval", type=int, default=300)
    args = parser.parse_args()

    save_dir = args.save_dir or os.environ.get("SAVE_INTEL_SAVE_DIR")
    out = args.out
    if out == "-" and os.environ.get("SAVE_INTEL_OUT"):
        out = os.environ["SAVE_INTEL_OUT"]
    interval = int(os.environ.get("SAVE_INTEL_INTERVAL_S", args.interval))

    def resolve():
        if args.sav:
            return args.sav
        if save_dir:
            return find_level_sav(save_dir)
        return None

    if not args.loop:
        sav = resolve()
        if not sav:
            print("no Level.sav found", file=sys.stderr)
            sys.exit(1)
        snap = snapshot_once(sav, out)
        print(
            f"guilds={snap['guild_count']} bases={snap['base_count']}",
            file=sys.stderr,
        )
        return

    while True:
        sav = resolve()
        if sav:
            try:
                snap = snapshot_once(sav, out)
                print(
                    f"intel: guilds={snap['guild_count']} bases={snap['base_count']} sav={sav}",
                    flush=True,
                )
            except Exception as err:
                print(f"intel error: {err}", flush=True)
        else:
            print("intel: no Level.sav yet", flush=True)
        time.sleep(interval)


if __name__ == "__main__":
    main()
