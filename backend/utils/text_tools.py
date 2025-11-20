# backend/utils/text_tools.py

import re
import json
from dataclasses import dataclass


def strip_control_markers(text: str) -> str:
    """
    删除 <SYS> ... </SYS> 控制块，只保留用户可见内容。
    """
    # re.S 让 '.' 可以匹配换行
    cleaned = re.sub(r"<SYS>.*?</SYS>", "", text, flags=re.S)
    return cleaned.strip()
@dataclass
class ControlFlags:
    end_test: bool = False
    has_report: bool = False
    # 以后可以扩展其它字段


def parse_control_flags(text: str) -> ControlFlags:
    """
    从完整的 assistant 输出中，解析 <SYS> 中的 JSON 指令。
    若没有 <SYS> 或 JSON 无效，则返回默认标志（全 False）。
    """
    m = re.search(r"<SYS>(.*?)</SYS>", text, flags=re.S)
    if not m:
        return ControlFlags()

    raw = m.group(1).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return ControlFlags()

    return ControlFlags(
        end_test=bool(data.get("end_test", False)),
        has_report=bool(data.get("has_report", False)),
    )
