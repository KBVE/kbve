"""Programmatic proto compilation wrapper.

Wraps ``grpc_tools.protoc`` so you don't need to remember the flags.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Sequence

logger = logging.getLogger(__name__)


def compile_proto(
    proto_files: str | Sequence[str],
    proto_path: str | Path = ".",
    python_out: str | Path = ".",
    grpc_out: str | Path | None = None,
    pyi_out: str | Path | None = None,
) -> int:
    """Compile ``.proto`` files to Python using grpc_tools.protoc.

    Args:
        proto_files: One or more ``.proto`` file paths.
        proto_path: Directory to search for imports (``--proto_path``).
        python_out: Output directory for ``_pb2.py`` files.
        grpc_out: Output directory for ``_pb2_grpc.py`` files (optional).
        pyi_out: Output directory for ``.pyi`` type stubs (optional).

    Returns:
        protoc exit code (0 = success).
    """
    from grpc_tools import protoc

    if isinstance(proto_files, str):
        proto_files = [proto_files]

    args = [
        "grpc_tools.protoc",
        f"--proto_path={proto_path}",
        f"--python_out={python_out}",
    ]

    if grpc_out is not None:
        args.append(f"--grpc_python_out={grpc_out}")

    if pyi_out is not None:
        args.append(f"--pyi_out={pyi_out}")

    args.extend(proto_files)

    logger.info("Compiling protos: %s", " ".join(args))
    exit_code = protoc.main(args)

    if exit_code == 0:
        logger.info(
            "Proto compilation succeeded for %d file(s)",
            len(proto_files),
        )
    else:
        logger.error(
            "Proto compilation failed with exit code %d", exit_code,
        )

    return exit_code
