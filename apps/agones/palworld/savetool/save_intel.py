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
)


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


def extract_guilds(properties):
    world = pv(properties, "worldSaveData") or {}
    groups = pv(world, "GroupSaveDataMap") or []
    camps = pv(world, "BaseCampSaveData") or []

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
