"""Imports every generated Python module.

Generation succeeding says nothing about whether the result loads: protobuf
raises at import time on a duplicate symbol or an unresolvable dependency, not
at generation time.
"""

import pathlib
import sys
import importlib.util

gen = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "gen/python")
sys.path.insert(0, str(gen))

modules = sorted(gen.rglob("*_pb2.py"))
if not modules:
    sys.exit(f"no generated modules found under {gen}")

failed = 0
for path in modules:
    name = ".".join(path.relative_to(gen).with_suffix("").parts)
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        spec.loader.exec_module(module)
        print(f"  ok   {name}")
    except Exception as exc:  # noqa: BLE001 - report every failure, not the first
        print(f"  FAIL {name}: {exc}")
        failed += 1

print(f"\n{len(modules) - failed}/{len(modules)} modules imported")
sys.exit(1 if failed else 0)
