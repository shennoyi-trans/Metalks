# backend/utils/validators.py
"""
通用验证工具函数
- 邮箱格式验证
- 昵称格式验证
- 密码强度验证
"""

import re
from typing import Tuple


# ============================================================
# 邮箱验证
# ============================================================

def validate_email_format(email: str) -> Tuple[bool, str]:
    """
    验证邮箱格式
    
    规则:
        - 基本格式：xxx@xxx.xxx
        - 使用简单正则匹配
    
    参数:
        email: 邮箱地址
    
    返回:
        (是否有效, 错误信息)
    """
    if not email:
        return False, "邮箱不能为空"
    
    # 简单的邮箱正则
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    
    if not re.match(pattern, email):
        return False, "邮箱格式不正确"
    
    if len(email) > 255:
        return False, "邮箱长度不能超过255个字符"
    
    return True, ""


# ============================================================
# 昵称验证
# ============================================================

def validate_nickname_format(nickname: str) -> Tuple[bool, str]:
    """
    验证昵称格式
    
    规则:
        - 长度：1-50个字符
        - 字符：不限制（中文、英文、数字、特殊字符都允许）
    
    参数:
        nickname: 昵称
    
    返回:
        (是否有效, 错误信息)
    """
    if not nickname:
        return False, "昵称不能为空"
    
    # 去除首尾空白
    nickname = nickname.strip()
    
    if not nickname:
        return False, "昵称不能为空"
    
    # 长度检查
    if len(nickname) < 1:
        return False, "昵称长度不能少于1个字符"
    
    if len(nickname) > 50:
        return False, "昵称长度不能超过50个字符"
    
    return True, ""


# ============================================================
# 密码验证
# ============================================================

def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    验证密码强度
    
    规则:
        - 最小长度：6个字符
        - 最大长度：128个字符
        - 可选：强制包含数字、字母、特殊字符（当前未启用）
    
    参数:
        password: 密码
    
    返回:
        (是否有效, 错误信息)
    """
    if not password:
        return False, "密码不能为空"
    
    # 长度检查
    if len(password) < 6:
        return False, "密码长度不能少于6个字符"
    
    if len(password) > 128:
        return False, "密码长度不能超过128个字符"
    
    # 可选：强制包含数字、字母、特殊字符
    # has_digit = any(c.isdigit() for c in password)
    # has_alpha = any(c.isalpha() for c in password)
    # has_special = any(not c.isalnum() for c in password)
    # 
    # if not (has_digit and has_alpha):
    #     return False, "密码必须包含字母和数字"
    
    return True, ""


# ============================================================
# 手机号验证（预留）
# ============================================================

def validate_phone_number(phone: str) -> Tuple[bool, str]:
    """
    验证手机号格式（预留功能）
    
    规则:
        - 中国大陆手机号：11位数字，以1开头
    
    参数:
        phone: 手机号
    
    返回:
        (是否有效, 错误信息)
    """
    if not phone:
        return False, "手机号不能为空"
    
    # 简单的手机号正则（中国大陆）
    pattern = r'^1[3-9]\d{9}$'
    
    if not re.match(pattern, phone):
        return False, "手机号格式不正确"
    
    return True, ""
