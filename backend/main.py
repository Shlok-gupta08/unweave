import os
import sys
import io
import re
import shutil
import uuid
import time
import threading
import logging

from fastapi import FastAPI, File, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

# ============================================================
# Logging
# ============================================================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("unweave")

# ============================================================
# GPU / Device Detection
# ============================================================
import torch

DEVICE_OVERRIDE = os.getenv("DEVICE_OVERRIDE", "").strip().lower()

# Flags
CUDA_AVAILABLE = False
MPS_AVAILABLE = False
DML_AVAILABLE = False
DEVICE_TYPE = "cpu"
DEVICE_NAME = "CPU"
GPU_VRAM_GB = None

if DEVICE_OVERRIDE:
    log.info(f"🔧 DEVICE_OVERRIDE set to '{DEVICE_OVERRIDE}'")

# CUDA (NVIDIA)
try:
    CUDA_AVAILABLE = torch.cuda.is_available()
    if CUDA_AVAILABLE:
        _cuda_name = torch.cuda.get_device_name(0)
        _cuda_vram = torch.cuda.get_device_properties(0).total_mem / 1024**3
        log.info(f"🟢 NVIDIA GPU detected: {_cuda_name} ({_cuda_vram:.1f} GB VRAM)")
except Exception:
    pass

# MPS (Apple Silicon)
try:
    MPS_AVAILABLE = hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
    if MPS_AVAILABLE:
        log.info("🟢 Apple Silicon GPU detected (MPS backend)")
except Exception:
    pass

# DirectML (AMD on Windows)
DML_DEVICE = None
try:
    import torch_directml
    DML_AVAILABLE = True
    DML_DEVICE = torch_directml.device()
    _dml_name = torch_directml.device_name(0)
    log.info(f"🟢 AMD/Intel GPU detected (DirectML): {_dml_name}")
except ImportError:
    pass

# Select device
if DEVICE_OVERRIDE == "cuda" and CUDA_AVAILABLE:
    DEVICE_TYPE = "cuda"
    DEVICE_NAME = torch.cuda.get_device_name(0)
    GPU_VRAM_GB = torch.cuda.get_device_properties(0).total_mem / 1024**3
elif DEVICE_OVERRIDE == "mps" and MPS_AVAILABLE:
    DEVICE_TYPE = "mps"
    DEVICE_NAME = "Apple Silicon (MPS)"
elif DEVICE_OVERRIDE == "directml" and DML_AVAILABLE:
    DEVICE_TYPE = "directml"
    DEVICE_NAME = torch_directml.device_name(0)
elif DEVICE_OVERRIDE == "cpu":
    DEVICE_TYPE = "cpu"
    DEVICE_NAME = "CPU (forced)"
elif DEVICE_OVERRIDE and DEVICE_OVERRIDE not in ("cuda", "mps", "directml", "cpu"):
    log.warning(f"⚠️  Unknown DEVICE_OVERRIDE '{DEVICE_OVERRIDE}', falling back to auto-detect")
    DEVICE_OVERRIDE = ""

if not DEVICE_OVERRIDE:
    if CUDA_AVAILABLE:
        DEVICE_TYPE = "cuda"
        DEVICE_NAME = torch.cuda.get_device_name(0)
        GPU_VRAM_GB = torch.cuda.get_device_properties(0).total_mem / 1024**3
    elif MPS_AVAILABLE:
        DEVICE_TYPE = "mps"
        DEVICE_NAME = "Apple Silicon (MPS)"
    elif DML_AVAILABLE:
        DEVICE_TYPE = "directml"
        DEVICE_NAME = torch_directml.device_name(0)
    else:
        DEVICE_TYPE = "cpu"
        DEVICE_NAME = "CPU"

log.info(f"🚀 Using device: {DEVICE_TYPE.upper()} — {DEVICE_NAME}")
if GPU_VRAM_GB:
    log.info(f"   VRAM: {GPU_VRAM_GB:.1f} GB")

# ============================================================
# Audio Separator
# ============================================================
from audio_separator.separator import Separator

# ============================================================
# Configuration
# ============================================================
CLOUD_MODE = os.getenv("CLOUD_MODE", "false").lower() == "true"
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", "50"))
CLEANUP_INTERVAL = int(os.getenv("CLEANUP_INTERVAL_SECONDS", "3600"))
RETENTION_SECONDS = 1800 if CLOUD_MODE else CLEANUP_INTERVAL

# ============================================================
# App Setup
# ============================================================
app = FastAPI(
    title="Unweave API",
    description="AI-powered audio stem separation",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMP_DIR = os.path.join(BASE_DIR, "temp_audio")
OUTPUT_DIR = os.path.join(BASE_DIR, "static_stems")
MODELS_DIR = os.path.join(BASE_DIR, "models")

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

app.mount("/stems", StaticFiles(directory=OUTPUT_DIR), name="stems")

# ============================================================
# Job Progress Tracking
# ============================================================
# Stores progress for active jobs:
# { job_id: { "status": "uploading|processing|complete|error",
#             "progress": 0-100, "eta_seconds": float,
#             "message": str, "stems": dict, "started_at": float,
#             "processing_time": float, "device_used": str } }
jobs: dict = {}
jobs_lock = threading.Lock()


def update_job(job_id: str, **kwargs):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id].update(kwargs)


def get_job(job_id: str) -> dict | None:
    with jobs_lock:
        return jobs.get(job_id, {}).copy() if job_id in jobs else None


# ============================================================
# Tqdm Progress Capture
# ============================================================
class TqdmCapture(io.StringIO):
    """Captures tqdm output and extracts progress percentage + ETA."""

    def __init__(self, job_id: str):
        super().__init__()
        self.job_id = job_id
        self._progress_pattern = re.compile(r'(\d+)%\|')
        self._eta_pattern = re.compile(r'<(\d+):(\d+)')
        self._rate_pattern = re.compile(r'([\d.]+)s/it')

    def write(self, s):
        if not s or s.strip() == '':
            return len(s) if s else 0

        # Try to parse tqdm progress
        progress_match = self._progress_pattern.search(s)
        if progress_match:
            pct = int(progress_match.group(1))
            eta_seconds = None

            eta_match = self._eta_pattern.search(s)
            if eta_match:
                minutes = int(eta_match.group(1))
                seconds = int(eta_match.group(2))
                eta_seconds = minutes * 60 + seconds

            update_job(
                self.job_id,
                progress=pct,
                eta_seconds=eta_seconds,
                message=f"Separating stems... {pct}%",
            )

        return len(s) if s else 0

    def flush(self):
        pass


# ============================================================
# Separation Worker
# ============================================================
def run_separation(job_id: str, input_path: str, job_out_dir: str, job_temp_dir: str):
    """Runs separation in a background thread with progress tracking."""
    try:
        update_job(job_id, status="processing", progress=0, message="Loading AI model...")

        start_time = time.time()

        # Configure separator
        separator_kwargs = {
            "output_dir": job_out_dir,
            "output_format": "mp3",
            "model_file_dir": MODELS_DIR,
        }

        if DEVICE_TYPE == "cuda":
            separator_kwargs["use_cuda"] = True
        elif DEVICE_TYPE == "directml":
            separator_kwargs["use_directml"] = True
        else:
            separator_kwargs["use_cuda"] = False

        separator = Separator(**separator_kwargs)
        separator.load_model(model_filename="htdemucs_6s.yaml")

        update_job(job_id, progress=5, message="Model loaded. Separating stems...")

        # Capture tqdm output to track progress
        tqdm_capture = TqdmCapture(job_id)
        old_stderr = sys.stderr
        sys.stderr = tqdm_capture

        try:
            output_files = separator.separate(input_path)
        finally:
            sys.stderr = old_stderr

        elapsed = time.time() - start_time
        log.info(f"✅ Separation complete in {elapsed:.1f}s: {output_files}")

        # Release GPU memory
        release_gpu_memory()

        # Build stems dict
        stems = {}
        stem_keywords = {
            "vocals": "Vocals",
            "drums": "Drums",
            "bass": "Bass",
            "guitar": "Guitar",
            "piano": "Piano",
            "other": "Other",
        }

        for stem_path in output_files:
            stem_basename = os.path.basename(stem_path)
            stem_lower = stem_basename.lower()
            for keyword, label in stem_keywords.items():
                if keyword in stem_lower:
                    stems[label] = f"/stems/{job_id}/{stem_basename}"
                    break

        # Fallback: scan output directory
        if not stems:
            log.warning("Scanning output dir for stems")
            for f in os.listdir(job_out_dir):
                if f.endswith(".mp3"):
                    stem_lower = f.lower()
                    for keyword, label in stem_keywords.items():
                        if keyword in stem_lower:
                            stems[label] = f"/stems/{job_id}/{f}"
                            break
                    else:
                        stems[f] = f"/stems/{job_id}/{f}"

        # Cleanup temp
        cleanup_files(job_temp_dir)

        update_job(
            job_id,
            status="complete",
            progress=100,
            message="Separation complete!",
            stems=stems,
            processing_time=round(elapsed, 1),
            device_used=DEVICE_TYPE,
            eta_seconds=0,
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        cleanup_files(job_temp_dir)
        cleanup_files(job_out_dir)
        release_gpu_memory()
        update_job(
            job_id,
            status="error",
            progress=0,
            message=str(e),
        )


# ============================================================
# Cleanup
# ============================================================
def cleanup_files(folder_path: str):
    if os.path.exists(folder_path):
        shutil.rmtree(folder_path)


def background_cleanup_thread():
    while True:
        try:
            now = time.time()
            # Clean old stems
            for d in os.listdir(OUTPUT_DIR):
                dir_path = os.path.join(OUTPUT_DIR, d)
                if os.path.isdir(dir_path):
                    if os.stat(dir_path).st_mtime < now - RETENTION_SECONDS:
                        shutil.rmtree(dir_path)
                        log.info(f"🧹 Cleaned up expired stems: {d}")
            # Clean old job status entries
            with jobs_lock:
                for jid in list(jobs.keys()):
                    j = jobs[jid]
                    if j.get("status") in ("complete", "error"):
                        started = j.get("started_at", 0)
                        if started and now - started > RETENTION_SECONDS:
                            del jobs[jid]
            time.sleep(600 if not CLOUD_MODE else 300)
        except Exception as e:
            log.error(f"Cleanup error: {e}")
            time.sleep(60)


threading.Thread(target=background_cleanup_thread, daemon=True).start()


# ============================================================
# GPU Memory Management
# ============================================================
def release_gpu_memory():
    if DEVICE_TYPE == "cuda":
        torch.cuda.empty_cache()
        torch.cuda.synchronize()
        log.info("🧹 CUDA memory cache cleared")
    elif DEVICE_TYPE == "mps":
        try:
            torch.mps.empty_cache()
            log.info("🧹 MPS memory cache cleared")
        except AttributeError:
            pass


# ============================================================
# Routes
# ============================================================
@app.get("/health")
async def health():
    gpu_info = {
        "status": "ok",
        "device_type": DEVICE_TYPE,
        "device_name": DEVICE_NAME,
        "gpu_available": DEVICE_TYPE != "cpu",
        "cloud_mode": CLOUD_MODE,
    }
    if GPU_VRAM_GB:
        gpu_info["vram_gb"] = round(GPU_VRAM_GB, 1)
    if DEVICE_TYPE == "cuda":
        gpu_info["cuda_version"] = torch.version.cuda
    return gpu_info


@app.post("/separate")
async def separate_audio(file: UploadFile = File(...)):
    """Upload audio and start async separation. Returns job_id for status polling."""

    if not file.filename:
        return JSONResponse({"error": "No file uploaded"}, status_code=400)

    # Read file and check size
    contents = await file.read()
    file_size_mb = len(contents) / (1024 * 1024)
    if file_size_mb > MAX_FILE_SIZE_MB:
        return JSONResponse(
            {"error": f"File too large ({file_size_mb:.1f} MB). Max: {MAX_FILE_SIZE_MB} MB"},
            status_code=413,
        )

    job_id = str(uuid.uuid4())
    job_temp_dir = os.path.join(TEMP_DIR, job_id)
    job_out_dir = os.path.join(OUTPUT_DIR, job_id)

    os.makedirs(job_temp_dir, exist_ok=True)
    os.makedirs(job_out_dir, exist_ok=True)

    input_path = os.path.join(job_temp_dir, file.filename)
    with open(input_path, "wb") as buffer:
        buffer.write(contents)

    # Initialize job tracking
    with jobs_lock:
        jobs[job_id] = {
            "status": "uploading",
            "progress": 0,
            "eta_seconds": None,
            "message": "Upload received, starting separation...",
            "stems": None,
            "started_at": time.time(),
            "processing_time": None,
            "device_used": DEVICE_TYPE,
        }

    # Start separation in a background thread
    log.info(f"🎵 Starting separation: {file.filename} ({file_size_mb:.1f} MB) on {DEVICE_TYPE.upper()}")
    thread = threading.Thread(
        target=run_separation,
        args=(job_id, input_path, job_out_dir, job_temp_dir),
        daemon=True,
    )
    thread.start()

    return {
        "job_id": job_id,
        "message": "Separation started",
        "status": "processing",
    }


@app.get("/status/{job_id}")
async def get_status(job_id: str):
    """Poll this endpoint for real-time separation progress."""
    job = get_job(job_id)
    if not job:
        return JSONResponse({"error": "Job not found"}, status_code=404)
    return job


@app.get("/jobs")
async def list_jobs():
    """List all active jobs. Used by frontend to reconnect after page reload."""
    with jobs_lock:
        active = {}
        for jid, j in jobs.items():
            active[jid] = {
                "status": j.get("status"),
                "progress": j.get("progress", 0),
                "message": j.get("message", ""),
            }
    return {"jobs": active}

