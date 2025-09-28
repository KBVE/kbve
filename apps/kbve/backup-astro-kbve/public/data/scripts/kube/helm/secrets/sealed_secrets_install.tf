provider "kubernetes" {
    config_path = "~/.kube/config"
}

provider "helm" {
    kubernetes {
        config_path = "~/.kube/config"
    }
}

resource "kubernetes_namespace" "sealed_secrets_namespace" {
    metadata {
        name = "sealed-secrets"
    }
}

resource "helm_release" "sealed_secrets" {
    name       = "sealed-secrets"
    namespace  = kubernetes_namespace.sealed_secrets_namespace.metadata[0].name
    chart      = "sealed-secrets"
    repository = "https://bitnami-labs.github.io/sealed-secrets"
    # version    = "2.6.0"  # Specify the version you want, or leave this field to install the latest version

    set {
        name  = "controller.create"
        value = "true"
    }

    set {
        name  = "controller.resources.limits.memory"
        value = "256Mi"
    }
}
