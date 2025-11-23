from fastapi import Depends, HTTPException, Request
from backend.core.security import decode_access_token

async def get_current_user(request: Request):

    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")

    user_id = payload.get("sub")
    return user_id
