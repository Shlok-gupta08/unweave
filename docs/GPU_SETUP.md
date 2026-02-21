# GPU Setup Guide

Unweave automatically detects and uses the best available GPU. This guide covers setup for each platform.

## GPU Support Matrix

| GPU | Backend | OS Support | Docker | Performance |
|-----|---------|-----------|--------|-------------|
| NVIDIA (CUDA) | `cuda` | Windows, Linux | ✅ | ⚡⚡⚡ Fastest |
| Apple Silicon (MPS) | `mps` | macOS | ❌ Native only | ⚡⚡ Fast |
| AMD (ROCm) | `rocm` | Linux | ✅ | ⚡⚡ Fast |
| AMD (DirectML) | `directml` | Windows | ❌ Native only | ⚡ Moderate |
| CPU | `cpu` | All | ✅ | 🐢 Slow |

## Estimated Processing Times

For a typical 4-minute song (htdemucs_6s model):

| Device | Time | Notes |
|--------|------|-------|
| NVIDIA RTX 4090 | ~15s | CUDA 12.1 |
| NVIDIA RTX 3080 | ~25s | CUDA 12.1 |
| Apple M3 Pro | ~45s | MPS |
| Apple M1 | ~90s | MPS |
| AMD RX 7900 | ~40s | ROCm 6.0 |
| AMD (DirectML) | ~60s | Windows, integrated GPUs |
| CPU (8-core) | ~3-5 min | Fallback |

---

## NVIDIA GPU (CUDA)

### Requirements
- NVIDIA GPU with Compute Capability 3.5+
- NVIDIA Driver 525+ (for CUDA 12.1)
- ~4 GB VRAM recommended

### Setup

**Windows:**
1. Install latest [NVIDIA Drivers](https://www.nvidia.com/download/index.aspx)
2. Verify: `nvidia-smi`
3. PyTorch install (handled by installer):
   ```bash
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
   ```

**Linux:**
1. Install NVIDIA drivers:
   ```bash
   # Ubuntu/Debian
   sudo apt install nvidia-driver-535
   sudo reboot
   ```
2. Verify: `nvidia-smi`
3. For Docker, install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html):
   ```bash
   curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
   curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
     sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
     sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
   sudo apt-get update && sudo apt-get install -y nvidia-container-toolkit
   sudo nvidia-ctk runtime configure --runtime=docker
   sudo systemctl restart docker
   ```

### Docker Deployment
```bash
docker-compose up --build
```
The default `docker-compose.yml` is pre-configured for NVIDIA GPUs.

---

## Apple Silicon (MPS)

### Requirements
- Mac with M1, M2, M3, or M4 chip
- macOS 12.3+ (Monterey or later)
- Python 3.11+

### Setup
MPS support is built into standard PyTorch — no extra drivers needed!

```bash
pip install torch torchaudio
```

### Verify MPS
```python
import torch
print(torch.backends.mps.is_available())  # Should print True
```

> **Note:** Docker does not support MPS passthrough. Run the backend natively for GPU acceleration on Mac.

### Run Natively
```bash
source backend/.venv/bin/activate
cd backend && python -m uvicorn main:app --reload
```

---

## AMD GPU

### Linux (ROCm) — Recommended

**Requirements:**
- AMD GPU with ROCm support (RX 6000+, Instinct MI series)
- ROCm 6.0+ drivers

**Setup:**
1. Install ROCm: [AMD ROCm Installation Guide](https://rocm.docs.amd.com/projects/install-on-linux/en/latest/)
   ```bash
   # Ubuntu 22.04
   sudo apt install rocm-hip-libraries
   ```
2. Add user to video group:
   ```bash
   sudo usermod -a -G video,render $USER
   ```
3. Install PyTorch with ROCm:
   ```bash
   pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.0
   ```

**Docker Deployment:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.rocm.yml up --build
```

### Windows (DirectML)

**Requirements:**
- Any DirectX 12 capable GPU (AMD, Intel, NVIDIA)
- Windows 10 1903+

**Setup:**
```bash
pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
pip install torch-directml
```

> **Note:** DirectML works with integrated GPUs but performance depends on available shared memory. Dedicated GPUs will perform significantly better.

---

## Configuration

### Environment Variable: `DEVICE_OVERRIDE`

Force a specific device instead of auto-detection:

```bash
# In .env file or environment:
DEVICE_OVERRIDE=cuda       # Force NVIDIA CUDA
DEVICE_OVERRIDE=mps        # Force Apple MPS
DEVICE_OVERRIDE=directml   # Force DirectML
DEVICE_OVERRIDE=cpu        # Force CPU (disable GPU)
DEVICE_OVERRIDE=           # Auto-detect (default)
```

### Auto-Detection Priority

When `DEVICE_OVERRIDE` is empty, Unweave detects devices in this order:

```
1. CUDA (NVIDIA)  →  Best performance, widest cloud support
2. MPS (Apple)    →  Native Mac acceleration
3. DirectML (AMD) →  Windows AMD/Intel fallback
4. CPU            →  Universal fallback
```

### Verifying Your Setup

Check the `/health` endpoint:
```bash
curl http://localhost:8000/health
```

Example response:
```json
{
  "status": "ok",
  "device_type": "cuda",
  "device_name": "NVIDIA GeForce RTX 4090",
  "gpu_available": true,
  "vram_gb": 24.0,
  "cuda_version": "12.1"
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| MPS not detected on Mac | Ensure macOS 12.3+ and Python 3.11+ |
| CUDA out of memory | Close other GPU apps, try `DEVICE_OVERRIDE=cpu` |
| ROCm GPU not detected | Check `rocm-smi`, ensure user in video group |
| DirectML slow | Expected for integrated GPUs — use dedicated GPU or cloud |
| Wrong GPU selected | Use `DEVICE_OVERRIDE` in `.env` to force specific device |
