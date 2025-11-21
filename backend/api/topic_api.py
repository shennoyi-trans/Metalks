# backend/api/topic_api.py
from fastapi import APIRouter
from backend.data.topics import TOPICS

router = APIRouter()

@router.get("/topics")
def get_topics():
    """
    返回所有话题（id, topic, concept_tag）
    """
    # 不返回 prompt_path，前端不需要
    return [
        {
            "id": t["id"],
            "topic": t["topic"],
            "concept_tag": t["concept_tag"]
        }
        for t in TOPICS
    ]

@router.get("/topics/random")
def get_random_topics(count: int = 6):
    """
    随机返回若干个话题（不包含 prompt_path）
    用于 mode1 的话题刷新。
    """
    import random
    from backend.data.topics import TOPICS

    count = max(1, min(count, len(TOPICS)))  # 限制范围
    selected = random.sample(TOPICS, count)

    return [
        {
            "id": t["id"],
            "topic": t["topic"],
            "concept_tag": t["concept_tag"]
        }
        for t in selected
    ]



"""
前端请求示例：GET http://localhost:8000/topics/random
[
  {
    "id": 4,
    "topic": "消费",
    "concept_tag": "消费观"
  },
  {
    "id": 1,
    "topic": "友谊",
    "concept_tag": "友谊观"
  },
  {
    "id": 3,
    "topic": "工作",
    "concept_tag": "工作观"
  }
]
"""