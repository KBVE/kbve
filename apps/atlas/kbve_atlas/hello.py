"""Sample Hello World application."""

# Docker Configuration
# docker_client = docker.APIClient(base_url='unix://var/run/docker.sock') (example of Docker Client)

# try:
#     import docker
# except ImportError as e:
#     if e.args[0] == "No module named 'docker'":
#         print("[ERROR] -> Grafana : The docker library is missing.")
#     else:
#         print(f"[ERROR] -> Grafana : {e}")

def hello():
    """Return a friendly greeting."""
    return "Hello atlas"
