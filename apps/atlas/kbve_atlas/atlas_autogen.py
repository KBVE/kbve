import autogen


class Atlas_autogen:

    def __init__(self, agent, proxy, atlas, docker = False):
        """Init"""
        
        config_list = autogen.config_list_from_json("OAI_CONFIG_LIST")

        llm_config={
            "request_timeout": 600,
            "seed": 42,
            "config_list": config_list,
            "temperature": 0,
        }

        self.agent = autogen.AssistantAgent(
            name="assistant",
            llm_config=llm_config,
        )

        self.proxy = autogen.UserProxyAgent(
            name="user_proxy",
            human_input_mode="NEVER", 
            is_termination_msg=lambda x: x.get("content", "").rstrip().endswith("TERMINATE"),
            code_execution_config={
                "work_dir": "coding",
                "use_docker": docker,
            },
        )

        return "husky raid"

    def marco():
        """Return a friendly greeting."""
        return "polo"
