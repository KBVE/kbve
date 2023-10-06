import autogen

# Docker Configuration
# docker_client = docker.APIClient(base_url='unix://var/run/docker.sock') (example of Docker Client)

try:
    import docker
except ImportError as e:
    if e.args[0] == "No module named 'docker'":
        print("[ERROR] -> Grafana : The docker library is missing.")
    else:
        print(f"[ERROR] -> Grafana : {e}")


# Autogen Configruation

config_list = autogen.config_list_from_json("OAI_CONFIG_LIST")

llm_config={
    "request_timeout": 600,
    "seed": 42,
    "config_list": config_list,
    "temperature": 0,
}

assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config=llm_config,
)

user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER", 
    is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
    code_execution_config={
        "work_dir": "coding",
        "use_docker": False,
    },
)

def init():
    """Halo!?"""
    return "husky raid!!?!!!!"

def marco():
    """Return a friendly greeting."""
    return "polo"
