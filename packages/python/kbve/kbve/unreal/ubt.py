import json
import os
from pathlib import Path

DEFAULT_ENGINE_BASE = Path("/Users/Shared/Epic Games")


def parse_engine_association(uproject: Path) -> str:
    data = json.loads(Path(uproject).read_text())
    return data["EngineAssociation"]


def resolve_engine_root(uproject: Path, override: Path | None = None) -> Path:
    if override is not None:
        return Path(override)
    env = os.environ.get("KBVE_UE_ROOT")
    if env:
        return Path(env)
    version = parse_engine_association(uproject)
    return DEFAULT_ENGINE_BASE / f"UE_{version}"


def generate_clang_db_command(
    engine_root: Path,
    uproject: Path,
    target: str,
    config: str,
    platform: str,
) -> list[str]:
    return [
        str(Path(engine_root) / "Engine/Build/BatchFiles/Mac/Build.sh"),
        target,
        platform,
        config,
        f"-project={uproject}",
        "-mode=GenerateClangDatabase",
    ]
