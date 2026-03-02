import os
import requests
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from jose import jwt
from dotenv import load_dotenv
from db import test_connection

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLERK_JWKS_URL = os.getenv("CLERK_JWKS_URL")

# Fetch Clerk public keys
jwks = requests.get(CLERK_JWKS_URL).json()


def verify_token(token: str):
    try:
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header["kid"]

        key = next(
            key for key in jwks["keys"]
            if key["kid"] == kid
        )

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=None,
            options={"verify_aud": False}
        )

        return payload

    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid token")


@app.get("/")
def root():
    return {"message": "Backend running"}


@app.get("/protected")
def protected_route(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing token")

    token = authorization.replace("Bearer ", "")
    payload = verify_token(token)

    return {
        "message": "Access granted",
        "user_id": payload.get("sub")
    }

@app.get("/db-test")
def db_test():
    try:
        result = test_connection()
        return {"db_status": "Connected", "result": result}
    except Exception as e:
        return {"db_status": "Connection Failed ❌", "error": str(e)}