# backend/llm_client/factory.py
from .deepseek_client import DeepSeekClient
from .mock_client import MockClient

def load_llm_client(config: dict):
    provider = config.get("provider", "mock")

    if provider == "deepseek":
        return DeepSeekClient(
            api_key=config["api_key"],
            model=config.get("model", "deepseek-chat")
        )

    return MockClient()
