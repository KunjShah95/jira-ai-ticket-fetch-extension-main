from fastapi import FastAPI
import uvicorn

app = FastAPI(title="Test Server")


@app.get("/")
async def root():
    return {"message": "FastAPI is working!"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


if __name__ == "__main__":
    print("Starting test FastAPI server...")
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="info")
