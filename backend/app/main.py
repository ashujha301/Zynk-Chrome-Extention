from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.init_db import init_db
from app.api.routes import user, agent, auth

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://localhost:3000"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

init_db()

app.include_router(user.router, prefix="/user", tags=["User"])
app.include_router(agent.router, prefix="/agent", tags=["Agent"])
app.include_router(auth.router, prefix="/auth", tags=["Auth"])


@app.get("/")
def root():
    return {"message": "Backend running"}