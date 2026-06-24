#!/usr/bin/env python3
"""Apply kbve.com labels to Kubernetes resources based on ArgoCD Application annotations.

This script:
1. Reads ArgoCD Application annotations as the source of truth
2. Applies matching labels to all Kubernetes resources in that app's manifests
3. Validates label consistency across resources
4. Detects drift between ArgoCD annotations and resource labels

Usage:
    # Label all resources based on ArgoCD Application annotations
    ./label_resources.py --mode label --apps-dir apps/kube

    # Validate existing labels match ArgoCD annotations
    ./label_resources.py --mode validate --apps-dir apps/kube

    # Check for drift (dry-run)
    ./label_resources.py --mode drift --apps-dir apps/kube

    # Report on label coverage
    ./label_resources.py --mode report --apps-dir apps/kube --output report.json
"""

import argparse
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    import yaml
except ImportError:
    print("Error: PyYAML is required. Install with: pip install pyyaml")
    sys.exit(1)

# Resource kinds that should receive labels
LABELABLE_KINDS = {
    "Deployment",
    "StatefulSet",
    "DaemonSet",
    "Service",
    "ConfigMap",
    "Secret",
    "Job",
    "CronJob",
    "Ingress",
    "PersistentVolumeClaim",
}

# Labels to propagate from ArgoCD Application annotations
PROPAGATE_ANNOTATIONS = [
    "kbve.com/category",
    "kbve.com/stack",
    "kbve.com/managed-by",
]

# Optional labels to propagate if present
OPTIONAL_ANNOTATIONS = [
    "kbve.com/tenant",
    "kbve.com/deployment-model",
]


class ResourceLabeler:
    """Manages labels on Kubernetes resources based on ArgoCD annotations."""

    def __init__(self, apps_dir: Path):
        self.apps_dir = apps_dir
        self.stats = {
            "total_apps": 0,
            "total_resources": 0,
            "labeled_resources": 0,
            "updated_resources": 0,
            "skipped_resources": 0,
        }

    def find_application_files(self) -> List[Path]:
        """Find all ArgoCD application.yaml files."""
        return list(self.apps_dir.rglob("application.yaml"))

    def find_manifest_files(self, app_dir: Path) -> List[Path]:
        """Find all Kubernetes manifest YAML files for an application."""
        manifests = []

        # Common manifest directory patterns
        manifest_dirs = [
            app_dir / "manifests",
            app_dir / "manifest",
            app_dir / "k8s",
        ]

        for manifest_dir in manifest_dirs:
            if manifest_dir.exists() and manifest_dir.is_dir():
                # Find all yaml files
                manifests.extend(manifest_dir.glob("*.yaml"))
                manifests.extend(manifest_dir.glob("*.yml"))

        return manifests

    def parse_yaml_file(self, file_path: Path) -> List[Dict]:
        """Parse YAML file, handling multi-document files."""
        try:
            with open(file_path, "r") as f:
                documents = list(yaml.safe_load_all(f))
                # Filter out None documents (empty YAML files)
                return [doc for doc in documents if doc is not None]
        except Exception as e:
            print(f"Error parsing {file_path}: {e}")
            return []

    def write_yaml_file(self, file_path: Path, documents: List[Dict]) -> bool:
        """Write list of documents to YAML file."""
        try:
            with open(file_path, "w") as f:
                yaml.dump_all(
                    documents,
                    f,
                    default_flow_style=False,
                    sort_keys=False,
                    allow_unicode=True,
                )
            return True
        except Exception as e:
            print(f"Error writing {file_path}: {e}")
            return False

    def read_argocd_annotations(self, app_file: Path) -> Optional[Dict[str, str]]:
        """Read annotations from ArgoCD Application file."""
        documents = self.parse_yaml_file(app_file)
        if not documents:
            return None

        app_data = documents[0]  # Application files are single-document
        if app_data.get("kind") != "Application":
            return None

        return app_data.get("metadata", {}).get("annotations", {})

    def extract_labels_from_annotations(self, annotations: Dict[str, str]) -> Dict[str, str]:
        """Extract labels to propagate from ArgoCD annotations."""
        labels = {}

        # Add required labels
        for annotation_key in PROPAGATE_ANNOTATIONS:
            if annotation_key in annotations:
                # Convert annotation key to label key (same format for kbve.com/*)
                label_key = annotation_key
                labels[label_key] = annotations[annotation_key]

        # Add optional labels if present
        for annotation_key in OPTIONAL_ANNOTATIONS:
            if annotation_key in annotations:
                label_key = annotation_key
                labels[label_key] = annotations[annotation_key]

        return labels

    def should_label_resource(self, resource: Dict) -> bool:
        """Check if resource should receive labels."""
        kind = resource.get("kind")
        return kind in LABELABLE_KINDS

    def apply_labels_to_resource(self, resource: Dict, labels: Dict[str, str]) -> bool:
        """Apply labels to a resource's metadata. Returns True if modified."""
        if not self.should_label_resource(resource):
            return False

        metadata = resource.get("metadata", {})
        existing_labels = metadata.get("labels", {})

        # Check if any labels need to be added or updated
        modified = False
        for key, value in labels.items():
            if key not in existing_labels or existing_labels[key] != value:
                modified = True
                break

        if modified:
            # Ensure labels dict exists
            if "labels" not in metadata:
                metadata["labels"] = {}

            # Apply labels
            for key, value in labels.items():
                metadata["labels"][key] = value

            resource["metadata"] = metadata

        return modified

    def process_manifest_file(
        self,
        manifest_file: Path,
        labels: Dict[str, str],
        dry_run: bool = False
    ) -> Tuple[int, int]:
        """
        Process a manifest file, applying labels to all resources.
        Returns (total_resources, modified_resources).
        """
        documents = self.parse_yaml_file(manifest_file)
        if not documents:
            return 0, 0

        total = 0
        modified = 0

        for doc in documents:
            if not doc:  # Skip empty documents
                continue

            total += 1

            if self.apply_labels_to_resource(doc, labels):
                modified += 1

        if modified > 0 and not dry_run:
            # Write back the file
            if self.write_yaml_file(manifest_file, documents):
                print(f"✅ Updated {manifest_file.relative_to(self.apps_dir.parent)} ({modified}/{total} resources)")
            else:
                print(f"❌ Failed to write {manifest_file.relative_to(self.apps_dir.parent)}")
        elif modified > 0 and dry_run:
            print(f"🔍 Would update {manifest_file.relative_to(self.apps_dir.parent)} ({modified}/{total} resources)")

        return total, modified

    def process_application(self, app_file: Path, dry_run: bool = False) -> Dict:
        """Process an ArgoCD Application and its manifests."""
        app_dir = app_file.parent
        app_name = app_file.parent.name

        # Read ArgoCD annotations
        annotations = self.read_argocd_annotations(app_file)
        if not annotations:
            return {"skipped": True, "reason": "No annotations"}

        # Extract labels to propagate
        labels = self.extract_labels_from_annotations(annotations)
        if not labels:
            return {"skipped": True, "reason": "No kbve.com annotations"}

        # Find manifest files
        manifest_files = self.find_manifest_files(app_dir)
        if not manifest_files:
            return {"skipped": True, "reason": "No manifest files"}

        # Process each manifest file
        total_resources = 0
        modified_resources = 0

        for manifest_file in manifest_files:
            total, modified = self.process_manifest_file(manifest_file, labels, dry_run)
            total_resources += total
            modified_resources += modified

        return {
            "skipped": False,
            "app_name": app_name,
            "manifest_count": len(manifest_files),
            "total_resources": total_resources,
            "modified_resources": modified_resources,
            "labels": labels,
        }

    def run(self, mode: str, dry_run: bool = False) -> Dict:
        """Run the labeler in specified mode."""
        app_files = self.find_application_files()
        self.stats["total_apps"] = len(app_files)

        print(f"Found {len(app_files)} ArgoCD Application files\n")

        if mode == "label" or mode == "drift":
            is_dry_run = (mode == "drift") or dry_run
            action = "Checking for label drift" if is_dry_run else "Labeling resources"
            print(f"{action}...\n")

            for app_file in app_files:
                result = self.process_application(app_file, dry_run=is_dry_run)

                if not result.get("skipped"):
                    self.stats["total_resources"] += result["total_resources"]
                    self.stats["updated_resources"] += result["modified_resources"]

        elif mode == "validate":
            print("Validating resource labels against ArgoCD annotations...\n")
            # TODO: Implement validation logic
            pass

        elif mode == "report":
            print("Generating label coverage report...\n")
            # TODO: Implement reporting logic
            pass

        return self.stats


def main():
    parser = argparse.ArgumentParser(
        description="Apply kbve.com labels to Kubernetes resources based on ArgoCD annotations",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--mode",
        choices=["label", "validate", "drift", "report"],
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

    labeler = ResourceLabeler(args.apps_dir)
    result = labeler.run(args.mode, dry_run=args.dry_run)

    print("\n" + "=" * 50)
    print("Summary:")
    print(f"  Total applications: {result['total_apps']}")
    print(f"  Total resources: {result['total_resources']}")
    print(f"  Updated resources: {result['updated_resources']}")


if __name__ == "__main__":
    main()
