from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
import os
import shutil
from audio_processor import process_audio

app = FastAPI(title="MelodyScribe Backend")

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# 1. API Endpoints
@app.post("/transcribe")
async def transcribe_audio_endpoint(
    file: UploadFile = File(...),
    fast_mode: bool = Form(default=True)  # 기본값: 빠른 모드
):
    try:
        file_location = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_location, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        print(f"\n[API] 파일 수신: {file.filename}, 빠른모드: {fast_mode}")
        midi_response = process_audio(file_location, fast_mode=fast_mode)

        # Cleanup upload
        if os.path.exists(file_location):
            os.remove(file_location)

        return JSONResponse(content=midi_response)

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# 2. Serve Static Frontend (Production Mode)
# We assume the frontend is built to ../frontend/out
FRONTEND_BUILD_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "out")

if os.path.exists(FRONTEND_BUILD_DIR):
    # Mount assets (non-root)
    app.mount("/_next", StaticFiles(directory=os.path.join(FRONTEND_BUILD_DIR, "_next")), name="_next")
    # app.mount("/", StaticFiles(directory=FRONTEND_BUILD_DIR, html=True), name="static") 
    # ^ Standard mounting might conflict with API, so we often do a catch-all route related to SPA
    
    @app.get("/")
    async def serve_index():
        return FileResponse(os.path.join(FRONTEND_BUILD_DIR, "index.html"))

    # Catch-all for other static files in root (favicon, etc)
    @app.get("/{full_path:path}")
    async def catch_all(full_path: str):
         # check if file exists in build dir
        file_path = os.path.join(FRONTEND_BUILD_DIR, full_path)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return FileResponse(file_path)
        # Fallback to index.html for client-side routing
        return FileResponse(os.path.join(FRONTEND_BUILD_DIR, "index.html"))

if __name__ == "__main__":
    import uvicorn
    # run on port 8000
    uvicorn.run(app, host="127.0.0.1", port=8000)
