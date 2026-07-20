"""
CLI commands for KBVE Graphify wrapper.
"""

import click
import json
import subprocess
import sys
from pathlib import Path
from typing import Optional


@click.command()
@click.option('--scope', type=click.Choice(['monorepo', 'app', 'package']), required=True,
              help='Scope of graph to build')
@click.option('--name', type=str, help='Name of app/package (required for app/package scope)')
@click.option('--output', type=click.Path(), required=True, help='Output directory for graph data')
@click.option('--semantic/--no-semantic', default=False, help='Enable semantic analysis (LLM pass)')
def build_main(scope: str, name: Optional[str], output: str, semantic: bool):
    """Build knowledge graph using Graphify."""

    if scope in ['app', 'package'] and not name:
        click.echo("Error: --name required for app/package scope", err=True)
        sys.exit(1)

    output_path = Path(output)
    output_path.mkdir(parents=True, exist_ok=True)

    # Determine source directory
    workspace_root = Path.cwd().parent.parent.parent

    if scope == 'monorepo':
        source_dir = workspace_root
        click.echo(f"Building graph for entire monorepo at {source_dir}")
    elif scope == 'app':
        source_dir = workspace_root / 'apps' / name
        if not source_dir.exists():
            click.echo(f"Error: App not found at {source_dir}", err=True)
            sys.exit(1)
        click.echo(f"Building graph for app: {name}")
    else:  # package
        source_dir = workspace_root / 'packages' / name
        if not source_dir.exists():
            click.echo(f"Error: Package not found at {source_dir}", err=True)
            sys.exit(1)
        click.echo(f"Building graph for package: {name}")

    # Build graphify command
    cmd = ['graphify', str(source_dir)]

    # Add output path
    cmd.extend(['--output', str(output_path)])

    # Use AST-only mode unless semantic flag is set
    if not semantic:
        cmd.append('--no-semantic')
        click.echo("Using AST-only mode (fast, no LLM)")
    else:
        click.echo("Using semantic analysis (may take longer)")

    # Run graphify
    click.echo(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        click.echo(result.stdout)
        click.echo(f"✓ Graph built successfully at {output_path / 'graph.json'}")
    except subprocess.CalledProcessError as e:
        click.echo(f"Error running graphify: {e.stderr}", err=True)
        sys.exit(1)
    except FileNotFoundError:
        click.echo("Error: 'graphify' command not found. Install with: uv tool install graphifyy", err=True)
        sys.exit(1)


@click.command()
@click.option('--graph', type=click.Path(exists=True), required=True, help='Path to graph.json file')
@click.option('--query', '-q', type=str, required=True, help='Semantic query')
def query_main(graph: str, query: str):
    """Query knowledge graph with semantic search."""

    graph_path = Path(graph)

    cmd = ['graphify', 'query', str(graph_path), query]

    click.echo(f"Querying graph: {query}")
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        click.echo(result.stdout)
    except subprocess.CalledProcessError as e:
        click.echo(f"Error querying graph: {e.stderr}", err=True)
        sys.exit(1)
    except FileNotFoundError:
        click.echo("Error: 'graphify' command not found. Install with: uv tool install graphifyy", err=True)
        sys.exit(1)


@click.command()
@click.option('--input', type=click.Path(exists=True), required=True, help='Input graph.json path')
@click.option('--output', type=click.Path(), required=True, help='Output web API JSON path')
def export_main(input: str, output: str):
    """Export graph to web-friendly JSON format."""

    input_path = Path(input)
    output_path = Path(output)

    output_path.parent.mkdir(parents=True, exist_ok=True)

    click.echo(f"Exporting {input_path} to {output_path}")

    try:
        with open(input_path, 'r') as f:
            graph_data = json.load(f)

        # Add metadata
        web_export = {
            "metadata": {
                "source": "graphify",
                "version": "0.1.0",
                "type": "semantic-knowledge-graph"
            },
            "graph": graph_data
        }

        with open(output_path, 'w') as f:
            json.dump(web_export, f, indent=2)

        click.echo(f"✓ Exported to {output_path}")

    except Exception as e:
        click.echo(f"Error exporting graph: {e}", err=True)
        sys.exit(1)


if __name__ == '__main__':
    build_main()
