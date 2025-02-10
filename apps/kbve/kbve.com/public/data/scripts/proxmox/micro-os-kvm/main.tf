# Proxmox provider configuration
provider "proxmox" {
  pm_api_url      = var.proxmox_url
  pm_user         = "root@pam"
  pm_password     = var.proxmox_password
  pm_tls_insecure = true
}





variable "proxmox_password" {
    description = "The password to authenticate with the Proxmox API"
}

variable "private_key_path" {
    description = "Path to the SSH private key for VM provisioning"
}

variable "proxmox_url" {
    description = "URL for the Proxmox API"
}