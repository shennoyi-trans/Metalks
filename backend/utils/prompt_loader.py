# backend/utils/prompt_loader.py
"""
统一加载提示词。
"""
import os
import logging

logger = logging.getLogger("prompt_loader")


def load_prompt(relative_path: str) -> str:
    """
    加载提示词文件

    参数:
        relative_path: 相对于 backend/prompts/ 的路径，如 "model1/system.txt"

    返回:
        提示词文本内容

    异常:
        FileNotFoundError: 提示词文件不存在时，附带完整路径信息
    """
    base_dir = os.path.dirname(os.path.dirname(__file__))
    full_path = os.path.join(base_dir, "prompts", relative_path)

    try:
        with open(full_path, "r", encoding="utf8") as f:
            return f.read()
    except FileNotFoundError:
        logger.error("提示词文件不存在: %s", full_path)
        raise FileNotFoundError(
            f"提示词文件不存在: {relative_path}（完整路径: {full_path}）"
        )
