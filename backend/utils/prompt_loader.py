# backend/utils/prompt_loader.py
"""
统一加载提示词。
"""
import os

def load_prompt(relative_path: str) -> str:
    """
    relative_path 例如 "opinion_test/intro.txt"
    """
    base_dir = os.path.dirname(os.path.dirname(__file__))
    full_path = os.path.join(base_dir, "prompts", relative_path)

    with open(full_path, "r", encoding="utf8") as f:
        return f.read()
    
