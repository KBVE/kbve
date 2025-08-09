# Talos Linux Intel NUC Worker Scripts

This directory contains automation scripts for adding Intel NUC devices as worker nodes to the existing Talos Linux cluster.

## Scripts Overview

### `prepare-nuc.sh`
Prepares an Intel NUC for joining the Talos cluster by:
- Generating WireGuard keys
- Creating customized worker configuration
- Optionally applying configuration to the NUC

**Usage:**
```bash
./prepare-nuc.sh [NUC_NUMBER] [CONTROL_PLANE_IP] [WG_NETWORK_BASE]
```

**Examples:**
```bash
# Prepare first NUC with default WireGuard network (10.0.0.x)
./prepare-nuc.sh 1 203.0.113.10

# Prepare second NUC with custom WireGuard network
./prepare-nuc.sh 2 203.0.113.10 192.168.100
```

### `verify-nuc-workers.sh`
Verifies that NUC worker nodes are properly joined and functioning in the cluster.

**Usage:**
```bash
./verify-nuc-workers.sh [CONTROL_PLANE_WG_IP] [WG_NETWORK_BASE]
```

**Examples:**
```bash
# Verify with default settings
./verify-nuc-workers.sh

# Verify with custom control plane IP
./verify-nuc-workers.sh 10.0.0.1
```

## Prerequisites

### Required Tools
- `talosctl` - Talos Linux CLI tool
- `kubectl` - Kubernetes CLI tool  
- `wg` - WireGuard tools for key generation
- `curl` - For downloading configurations

### Installation
```bash
# Install Talos CLI
curl -sL https://talos.dev/install | sh

# Install kubectl
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl

# Install WireGuard tools
sudo apt update && sudo apt install wireguard-tools
```

## Workflow

### Phase 1: Hardware Setup
1. Assemble Intel NUC with RAM and SSD
2. Configure BIOS settings
3. Install Talos Linux via USB boot

### Phase 2: Network Configuration  
1. Run `prepare-nuc.sh` for each NUC
2. Add generated public keys to control plane WireGuard config
3. Apply worker configuration to each NUC

### Phase 3: Verification
1. Run `verify-nuc-workers.sh` to check cluster status
2. Monitor node joining with `kubectl get nodes -w`
3. Test workload scheduling on NUC workers

## File Structure

```
talos/
├── README.md                 # This file
├── prepare-nuc.sh           # NUC preparation script
├── verify-nuc-workers.sh    # Cluster verification script
├── keys/                    # Generated WireGuard keys (gitignored)
│   ├── nuc-01-private.key
│   ├── nuc-01-public.key
│   └── ...
└── configs/                 # Generated worker configurations
    ├── worker-nuc-01.yaml
    ├── worker-nuc-02.yaml
    └── ...
```

## Configuration Templates

The worker configuration template is located at:
- `apps/kube/talos-worker.yaml` - Base template for NUC workers

## Troubleshooting

### Common Issues

1. **WireGuard connection failed**
   ```bash
   # Check WireGuard status
   sudo wg show
   
   # Verify firewall allows UDP port 51820
   sudo ufw allow 51820/udp
   ```

2. **NUC not joining cluster**
   ```bash
   # Check Talos logs
   talosctl logs --nodes [NUC_IP] kubelet
   
   # Verify cluster connectivity
   talosctl --talosconfig=/dev/null time --nodes [NUC_IP]
   ```

3. **Script dependencies missing**
   ```bash
   # Check which tools are missing
   for cmd in talosctl kubectl wg curl; do
     command -v $cmd >/dev/null 2>&1 || echo "Missing: $cmd"
   done
   ```

### Log Locations

- Script logs: Console output
- WireGuard keys: `./keys/`
- Worker configs: `./configs/`
- Talos logs: `talosctl logs --nodes [NODE_IP]`

## Security Notes

- WireGuard private keys are stored in `./keys/` directory with 600 permissions
- Keys directory should be added to `.gitignore` to prevent accidental commits
- Use unique keys for each NUC worker node
- Consider using hardware TPM for production key storage

## References

- [Talos Linux Documentation](https://www.talos.dev/docs/)
- [WireGuard Configuration Guide](../../../../../astro-kbve/src/content/docs/application/wireguard.mdx)
- [Intel NUC Talos Setup Guide](../../../../../astro-kbve/src/content/docs/application/intel-nuc-talos.mdx)