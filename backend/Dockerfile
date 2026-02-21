# ============================================================
# Unweave Backend — NVIDIA CUDA Dockerfile
# Optimized for NVIDIA GPU deployment (cloud + local)
# ============================================================
FROM nvidia/cuda:12.1.1-runtime-ubuntu22.04

LABEL maintainer="Unweave"
LABEL description="Unweave AI audio stem separation backend (NVIDIA GPU)"

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Ensure NVIDIA runtime is visible in cloud containers (ACI, Cloud Run, ECS)
ENV NVIDIA_VISIBLE_DEVICES=all
ENV NVIDIA_DRIVER_CAPABILITIES=compute,utility

# Install Python 3.11, ffmpeg, and build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    software-properties-common \
    && add-apt-repository ppa:deadsnakes/ppa \
    && apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3-pip \
    ffmpeg \
    libavcodec-extra \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set python3.11 as default
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

WORKDIR /app

# Install PyTorch with CUDA 12.1 support (large download, cached separately)
RUN python -m pip install --no-cache-dir --default-timeout=1000 \
    torch torchaudio --index-url https://download.pytorch.org/whl/cu121

# Install other dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=1000 -r requirements.txt

COPY . .

# Create required directories
RUN mkdir -p /app/models /app/temp_audio /app/static_stems

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

