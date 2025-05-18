from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import uuid
import subprocess
import sys

app = FastAPI()

# Allow CORS for Vercel frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://big-car.vercel.app"],  # Only allow your frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

RENDER_DIR = "renders"
os.makedirs(RENDER_DIR, exist_ok=True)

@app.post("/render")
async def render_manim(code: str = Form(...)):
    """
    Accepts Manim code as a string, writes it to a temp file, renders it, and returns the video file.
    """
    print("Received code:\n", code, file=sys.stderr)
    scene_id = str(uuid.uuid4())
    py_file = os.path.join(RENDER_DIR, f"scene_{scene_id}.py")
    video_file = os.path.join(RENDER_DIR, f"scene_{scene_id}.mp4")

    # Write the code to a .py file
    with open(py_file, "w", encoding="utf-8") as f:
        f.write(code)

    # Run Manim to render the video
    try:
        result = subprocess.run([
            "manim", py_file, "-qm", "--format=mp4", "-o", video_file
        ], capture_output=True, text=True, timeout=60)
        print("Manim stderr:\n", result.stderr, file=sys.stderr)
        if result.returncode != 0:
            return JSONResponse(status_code=400, content={"error": result.stderr})
        # Find the output video file
        if os.path.exists(video_file):
            return FileResponse(video_file, media_type="video/mp4", filename=f"scene_{scene_id}.mp4")
        else:
            return JSONResponse(status_code=404, content={"error": "Video file not found after rendering."})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    finally:
        # Clean up the .py file (optional: also clean up video after serving)
        if os.path.exists(py_file):
            os.remove(py_file)
