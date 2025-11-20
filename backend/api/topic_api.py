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
