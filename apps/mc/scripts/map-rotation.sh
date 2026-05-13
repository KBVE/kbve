#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# MC Map Rotation — preserve starter zone, delete everything else
#
# Minecraft regenerates terrain on the fly when a player enters a chunk
# that has no region file. By deleting region files outside the protected
# radius, we get a fresh world around the same starter zone.
#
# Region file math:
#   block -> chunk:  floor(block / 16)
#   chunk -> region: floor(chunk / 32)
#   region r.X.Z.mca covers blocks [X*512 .. X*512+511] on both axes
#
# Environment variables (all have defaults):
#   WORLD_DIR          — path to world directory (default: /data/world)
#   BACKUP_DIR         — where to store pre-rotation backup (default: /data/backups)
#   CENTER_X           — starter zone center X block (default: 0)
#   CENTER_Z           — starter zone center Z block (default: 0)
#   PROTECT_RADIUS     — radius in blocks to preserve (default: 512)
#   RESET_NETHER       — delete nether entirely (default: true)
#   RESET_END          — delete end entirely (default: true)
#   RESET_PLAYERDATA   — delete playerdata/stats/advancements (default: false)
#   DRY_RUN            — if "true", only print what would be deleted (default: false)
# ---------------------------------------------------------------------------

WORLD_DIR="${WORLD_DIR:-/data/world}"
BACKUP_DIR="${BACKUP_DIR:-/data/backups}"
CENTER_X="${CENTER_X:-0}"
CENTER_Z="${CENTER_Z:-0}"
PROTECT_RADIUS="${PROTECT_RADIUS:-512}"
RESET_NETHER="${RESET_NETHER:-true}"
RESET_END="${RESET_END:-true}"
RESET_PLAYERDATA="${RESET_PLAYERDATA:-false}"
DRY_RUN="${DRY_RUN:-false}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

log() { echo "[map-rotation] $(date -u +%H:%M:%S) $*"; }

floor_div() {
    local num=$1 div=$2
    # Bash integer division truncates toward zero; we need floor (toward -inf)
    if (( num >= 0 )); then
        echo $(( num / div ))
    else
        echo $(( (num - div + 1) / div ))
    fi
}

# Check if a region file (r.X.Z.mca) overlaps with the protected zone.
# A region covers blocks [rx*512 .. rx*512+511] x [rz*512 .. rz*512+511].
# The protected zone is a square from (cx-r, cz-r) to (cx+r, cz+r).
region_is_protected() {
    local rx=$1 rz=$2
    local region_min_x=$(( rx * 512 ))
    local region_max_x=$(( rx * 512 + 511 ))
    local region_min_z=$(( rz * 512 ))
    local region_max_z=$(( rz * 512 + 511 ))

    local protect_min_x=$(( CENTER_X - PROTECT_RADIUS ))
    local protect_max_x=$(( CENTER_X + PROTECT_RADIUS ))
    local protect_min_z=$(( CENTER_Z - PROTECT_RADIUS ))
    local protect_max_z=$(( CENTER_Z + PROTECT_RADIUS ))

    # AABB overlap test: regions overlap if no axis is fully separated
    if (( region_max_x < protect_min_x || region_min_x > protect_max_x )); then
        return 1
    fi
    if (( region_max_z < protect_min_z || region_min_z > protect_max_z )); then
        return 1
    fi
    return 0
}

# Process a directory of .mca files, deleting those outside the zone
process_region_dir() {
    local dir=$1 label=$2
    local kept=0 deleted=0

    if [[ ! -d "$dir" ]]; then
        log "$label: directory not found, skipping"
        return
    fi

    for f in "$dir"/r.*.*.mca; do
        [[ -f "$f" ]] || continue
        local basename
        basename=$(basename "$f")

        # Parse r.X.Z.mca using pure bash (portable across BSD/GNU)
        local rx rz stripped
        stripped="${basename#r.}"
        stripped="${stripped%.mca}"
        rx="${stripped%%.*}"
        rz="${stripped#*.}"

        if [[ -z "$rx" || -z "$rz" || "$rx" == "$rz" && "$stripped" != "$rx.$rz" ]]; then
            log "$label: skipping unparseable file: $basename"
            continue
        fi

        if region_is_protected "$rx" "$rz"; then
            log "$label: KEEP   $basename (region $rx,$rz overlaps protected zone)"
            (( kept++ )) || true
        else
            if [[ "$DRY_RUN" == "true" ]]; then
                log "$label: DELETE (dry-run) $basename (region $rx,$rz)"
            else
                rm -f "$f"
                log "$label: DELETE $basename (region $rx,$rz)"
            fi
            (( deleted++ )) || true
        fi
    done

    log "$label: kept=$kept deleted=$deleted"
}

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

if [[ ! -d "$WORLD_DIR" ]]; then
    log "ERROR: world directory not found: $WORLD_DIR"
    exit 1
fi

log "=== MC Map Rotation ==="
log "World:           $WORLD_DIR"
log "Center:          ($CENTER_X, $CENTER_Z)"
log "Protect radius:  $PROTECT_RADIUS blocks"
log "Reset nether:    $RESET_NETHER"
log "Reset end:       $RESET_END"
log "Reset playerdata:$RESET_PLAYERDATA"
log "Dry run:         $DRY_RUN"

# Calculate protected region file range for logging
min_rx=$(floor_div $(( CENTER_X - PROTECT_RADIUS )) 512)
max_rx=$(floor_div $(( CENTER_X + PROTECT_RADIUS )) 512)
min_rz=$(floor_div $(( CENTER_Z - PROTECT_RADIUS )) 512)
max_rz=$(floor_div $(( CENTER_Z + PROTECT_RADIUS )) 512)
log "Protected regions: r.[$min_rx..$max_rx].[$min_rz..$max_rz].mca"

# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

if [[ "$DRY_RUN" != "true" ]]; then
    mkdir -p "$BACKUP_DIR"
    backup_name="world-pre-rotation-$(date -u +%Y%m%d-%H%M%S).tar.gz"
    log "Creating backup: $BACKUP_DIR/$backup_name"
    tar -czf "$BACKUP_DIR/$backup_name" -C "$(dirname "$WORLD_DIR")" "$(basename "$WORLD_DIR")"
    log "Backup complete: $(du -sh "$BACKUP_DIR/$backup_name" | cut -f1)"
fi

# ---------------------------------------------------------------------------
# Process overworld region data (region/, entities/, poi/)
# ---------------------------------------------------------------------------

process_region_dir "$WORLD_DIR/region"   "overworld/region"
process_region_dir "$WORLD_DIR/entities" "overworld/entities"
process_region_dir "$WORLD_DIR/poi"      "overworld/poi"

# ---------------------------------------------------------------------------
# Nether and End (full reset if configured)
# ---------------------------------------------------------------------------

if [[ "$RESET_NETHER" == "true" ]]; then
    if [[ -d "$WORLD_DIR/DIM-1" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log "nether: DELETE (dry-run) entire DIM-1/"
        else
            rm -rf "$WORLD_DIR/DIM-1"
            log "nether: DELETED entire DIM-1/"
        fi
    else
        log "nether: DIM-1/ not found, skipping"
    fi
fi

if [[ "$RESET_END" == "true" ]]; then
    if [[ -d "$WORLD_DIR/DIM1" ]]; then
        if [[ "$DRY_RUN" == "true" ]]; then
            log "end: DELETE (dry-run) entire DIM1/"
        else
            rm -rf "$WORLD_DIR/DIM1"
            log "end: DELETED entire DIM1/"
        fi
    else
        log "end: DIM1/ not found, skipping"
    fi
fi

# ---------------------------------------------------------------------------
# Player data (optional reset)
# ---------------------------------------------------------------------------

if [[ "$RESET_PLAYERDATA" == "true" ]]; then
    for subdir in playerdata stats advancements; do
        if [[ -d "$WORLD_DIR/$subdir" ]]; then
            if [[ "$DRY_RUN" == "true" ]]; then
                log "playerdata: DELETE (dry-run) $subdir/"
            else
                rm -rf "$WORLD_DIR/$subdir"
                log "playerdata: DELETED $subdir/"
            fi
        fi
    done
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

log "=== Map rotation complete ==="
if [[ "$DRY_RUN" == "true" ]]; then
    log "This was a DRY RUN — no files were modified."
fi
