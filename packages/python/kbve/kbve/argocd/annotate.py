#!/usr/bin/env python3
"""Manage ArgoCD Application annotations for KBVE cluster.

This script can:
1. Add missing annotations to ArgoCD Application YAML files
2. Validate existing annotations against schema
3. Detect drift (missing or incorrect annotations)
4. Report on annotation coverage

Usage:
    # Add annotations to all applications
    ./annotate.py --mode add --apps-dir apps/kube

    # Validate existing annotations
    ./annotate.py --mode validate --apps-dir apps/kube

    # Check for drift (dry-run)
    ./annotate.py --mode drift --apps-dir apps/kube

    # Generate coverage report
    ./annotate.py --mode report --apps-dir apps/kube --output report.json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)

# Schema version
SCHEMA_VERSION = "v1"

# Category mapping based on directory structure and common patterns
CATEGORY_MAPPING = {
    "agones": "game-server",
    "rows": "game-server",
    "kbve": "application",
    "herbmail": "application",
    "n8n": "application",
    "jobboard": "application",
    "argocd": "infrastructure",
    "cert-manager": "infrastructure",
    "reloader": "infrastructure",
    "gateway-api": "infrastructure",
    "cnpg": "database",
    "clickhouse": "database",
    "valkey": "database",
    "rabbitmq": "database",
    "monitoring": "observability",
    "metrics": "observability",
    "vector": "observability",
    "analytics": "observability",
    "github": "ci-cd",
    "forgejo": "ci-cd",
    "cilium": "networking",
    "kong": "networking",
    "multus": "networking",
    "kubevirt": "virtualization",
    "kasm": "virtualization",
    "firecracker": "virtualization",
    "clickhouse-operator": "operator",
    "kyverno": "operator",
    "keda": "operator",
    "crossplane": "operator",
    "sealed-secrets": "security",
    "external-secrets": "security",
    "security-profiles-operator": "security",
    "storage": "infrastructure",
    "namespace": "infrastructure",
    "elk": "observability",
}

# Stack mapping
STACK_MAPPING = {
    "agones": "agones",
    "rows": "rows",
    "kbve": "core",
    "auth": "supabase",
    "storage": "supabase",
    "storage-api": "supabase",
    "realtime": "supabase",
    "functions": "supabase",
    "studio": "supabase",
    "postgrest": "supabase",
    "analytics": "supabase",
    "meta": "supabase",
    "clickhouse": "clickhouse",
    "clickhouse-crds": "clickhouse",
    "clickhouse-operator": "clickhouse",
    "cilium": "cilium",
    "github": "github-actions",
}

# Deployment model detection patterns
DEPLOYMENT_MODEL_PATTERNS = {
    "multi-tenant-overlay": r"/tenants/overlays/",
    "kustomize-overlay": r"/overlays/",
}


class AnnotationManager:
    """Manages ArgoCD Application annotations."""

    def __init__(self, apps_dir: Path):
        self.apps_dir = apps_dir
        self.stats = {
            "total": 0,
            "annotated": 0,
            "missing": 0,
            "invalid": 0,
            "updated": 0,
        }

    def find_application_files(self) -> List[Path]:
        """Find all application.yaml files in apps directory."""
        return list(self.apps_dir.rglob("application.yaml"))

    def parse_yaml(self, file_path: Path) -> Optional[Dict]:
        """Parse YAML file and return dict."""
        try:
            with open(file_path, "r") as f:
                return yaml.safe_load(f)
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            return None

    def write_yaml(self, file_path: Path, data: Dict) -> bool:
        """Write dict to YAML file preserving formatting."""
        try:
            with open(file_path, "w") as f:
                yaml.dump(
                    data,
                    f,
                    default_flow_style=False,
                    sort_keys=False,
                    allow_unicode=True,
                )
            return True
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
            return False

    def extract_metadata(self, file_path: Path, app_data: Dict) -> Dict[str, str]:
        """Extract metadata from file path and application spec."""
        relative_path = file_path.relative_to(self.apps_dir.parent)
        source_path = str(relative_path.parent)

        # Get manifest path from spec.source.path or use source_path
        manifest_path = app_data.get("spec", {}).get("source", {}).get("path", source_path)

        # Determine category and stack
        parts = source_path.split("/")

        # Check parent directories for category hints
        category = "application"  # default
        stack = "core"  # default

        for part in parts:
            if part in CATEGORY_MAPPING:
                category = CATEGORY_MAPPING[part]
                break

        for part in parts:
            if part in STACK_MAPPING:
                stack = STACK_MAPPING[part]
                break

        # Detect deployment model
        deployment_model = None
        for model, pattern in DEPLOYMENT_MODEL_PATTERNS.items():
            if re.search(pattern, str(relative_path)):
                deployment_model = model
                break

        # Extract tenant from path if multi-tenant
        tenant = None
        if "tenants/overlays/" in str(relative_path):
            tenant_match = re.search(r"tenants/overlays/([^/]+)", str(relative_path))
            if tenant_match:
                tenant = tenant_match.group(1)

        metadata = {
            "kbve.com/source-path": source_path,
            "kbve.com/manifest-path": manifest_path,
            "kbve.com/application-file": str(relative_path),
            "kbve.com/managed-by": "argocd",
            "kbve.com/schema-version": SCHEMA_VERSION,
            "kbve.com/category": category,
            "kbve.com/stack": stack,
        }

        if deployment_model:
            metadata["kbve.com/deployment-model"] = deployment_model

        if tenant:
            metadata["kbve.com/tenant"] = tenant

        return metadata

    def validate_annotations(self, annotations: Dict[str, str]) -> Tuple[bool, List[str]]:
        """Validate annotations against schema. Returns (is_valid, errors)."""
        errors = []

        # Required annotations
        required = [
            "kbve.com/source-path",
            "kbve.com/manifest-path",
            "kbve.com/application-file",
            "kbve.com/managed-by",
            "kbve.com/schema-version",
        ]

        for req in required:
            if req not in annotations:
                errors.append(f"Missing required annotation: {req}")

        # Check schema version
        if annotations.get("kbve.com/schema-version") != SCHEMA_VERSION:
            errors.append(f"Invalid schema version: {annotations.get('kbve.com/schema-version')}")

        # Check managed-by
        if annotations.get("kbve.com/managed-by") != "argocd":
            errors.append(f"Invalid managed-by value: {annotations.get('kbve.com/managed-by')}")

        return len(errors) == 0, errors

    def add_annotations(self, file_path: Path, dry_run: bool = False) -> bool:
        """Add annotations to application file."""
        app_data = self.parse_yaml(file_path)
        if not app_data:
            return False

        # Check if it's an ArgoCD Application
        if app_data.get("kind") != "Application":
            return False

        metadata = app_data.get("metadata", {})
        existing_annotations = metadata.get("annotations", {})

        # Extract expected annotations
        expected = self.extract_metadata(file_path, app_data)

        # Check if already has annotations
        has_schema = "kbve.com/schema-version" in existing_annotations

        if has_schema:
            # Validate existing
            is_valid, errors = self.validate_annotations(existing_annotations)
            if is_valid:
                self.stats["annotated"] += 1
                return True
            else:
                print(f"⚠️  {file_path.relative_to(self.apps_dir.parent)}")
                for error in errors:
                    print(f"    - {error}")
                self.stats["invalid"] += 1

        # Add/update annotations
        if not dry_run:
            if "annotations" not in metadata:
                metadata["annotations"] = {}

            # Merge annotations (expected overwrites existing for kbve.com/* keys)
            for key, value in expected.items():
                metadata["annotations"][key] = value

            app_data["metadata"] = metadata

            if self.write_yaml(file_path, app_data):
                print(f"✅ {file_path.relative_to(self.apps_dir.parent)}")
                self.stats["updated"] += 1
                return True
            else:
                print(f"❌ Failed to write {file_path.relative_to(self.apps_dir.parent)}")
                return False
        else:
            print(f"🔍 Would update: {file_path.relative_to(self.apps_dir.parent)}")
            for key, value in expected.items():
                if key not in existing_annotations or existing_annotations[key] != value:
                    print(f"    + {key}: {value}")
            self.stats["missing"] += 1
            return True

    def report_coverage(self) -> Dict:
        """Generate coverage report."""
        files = self.find_application_files()
        report = {
            "total_applications": len(files),
            "annotated": 0,
            "missing_annotations": 0,
            "invalid_annotations": 0,
            "applications": [],
        }

        for file_path in files:
            app_data = self.parse_yaml(file_path)
            if not app_data or app_data.get("kind") != "Application":
                continue

            annotations = app_data.get("metadata", {}).get("annotations", {})
            has_schema = "kbve.com/schema-version" in annotations

            app_info = {
                "file": str(file_path.relative_to(self.apps_dir.parent)),
                "name": app_data.get("metadata", {}).get("name", "unknown"),
                "namespace": app_data.get("metadata", {}).get("namespace", "unknown"),
                "has_annotations": has_schema,
                "valid": False,
                "errors": [],
            }

            if has_schema:
                is_valid, errors = self.validate_annotations(annotations)
                app_info["valid"] = is_valid
                app_info["errors"] = errors

                if is_valid:
                    report["annotated"] += 1
                else:
                    report["invalid_annotations"] += 1
            else:
                report["missing_annotations"] += 1
                app_info["errors"] = ["Missing kbve.com annotations"]

            report["applications"].append(app_info)

        return report

    def run(self, mode: str, dry_run: bool = False) -> Dict:
        """Run the annotation manager in specified mode."""
        files = self.find_application_files()
        self.stats["total"] = len(files)

        print(f"Found {len(files)} ArgoCD Application files\n")

        if mode == "add":
            print(f"{'DRY RUN - ' if dry_run else ''}Adding annotations...\n")
            for file_path in files:
                self.add_annotations(file_path, dry_run=dry_run)

        elif mode == "validate":
            print("Validating annotations...\n")
            for file_path in files:
                app_data = self.parse_yaml(file_path)
                if not app_data or app_data.get("kind") != "Application":
                    continue

                annotations = app_data.get("metadata", {}).get("annotations", {})
                is_valid, errors = self.validate_annotations(annotations)

                if is_valid:
                    self.stats["annotated"] += 1
                    print(f"✅ {file_path.relative_to(self.apps_dir.parent)}")
                else:
                    self.stats["invalid"] += 1
                    print(f"❌ {file_path.relative_to(self.apps_dir.parent)}")
                    for error in errors:
                        print(f"    - {error}")

        elif mode == "drift":
            print("Checking for annotation drift...\n")
            for file_path in files:
                self.add_annotations(file_path, dry_run=True)

        elif mode == "report":
            return self.report_coverage()

        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Manage ArgoCD Application annotations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        choices=["add", "validate", "drift", "report"],
        required=True,
        help="Operation mode",
    )
    parser.add_argument(
        "--apps-dir",
        type=Path,
        default=Path("apps/kube"),
        help="Path to apps/kube directory (default: apps/kube)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Don't modify files, just show what would change",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Output file for report (JSON format)",
    )

    args = parser.parse_args()

    if not args.apps_dir.exists():
        print(f"Error: Directory {args.apps_dir} does not exist")
        sys.exit(1)

    manager = AnnotationManager(args.apps_dir)
    result = manager.run(args.mode, dry_run=args.dry_run)

    if args.mode == "report":
        if args.output:
            with open(args.output, "w") as f:
                json.dump(result, f, indent=2)
            print(f"Report written to {args.output}")
        else:
            print(json.dumps(result, indent=2))
    else:
        print("\n" + "=" * 50)
        print("Summary:")
        print(f"  Total applications: {result['total']}")
        print(f"  Annotated: {result['annotated']}")
        print(f"  Missing annotations: {result['missing']}")
        print(f"  Invalid annotations: {result['invalid']}")
        print(f"  Updated: {result['updated']}")


if __name__ == "__main__":
    main()
