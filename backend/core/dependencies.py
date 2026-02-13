from fastapi import Depends, HTTPException, Request
from backend.core.security import decode_access_token

async def get_current_user(request: Request):

    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")


    user_id_str = payload.get("sub")
    
    if not user_id_str:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    
    try:
        user_id = int(user_id_str)
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user ID in token")
    return user_id
