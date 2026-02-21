#!/usr/bin/env bash
# ============================================================
# Unweave — Linux One-Click Installer
# Usage: chmod +x scripts/install.sh && ./scripts/install.sh
# ============================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  Unweave — One-Click Installer (Linux)    ${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# -----------------------------------------------------------
# Helper: Check if a command exists
# -----------------------------------------------------------
command_exists() {
    command -v "$1" &> /dev/null
}

# -----------------------------------------------------------
# Detect distro
# -----------------------------------------------------------
DISTRO="unknown"
if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO="$ID"
fi
echo -e "${CYAN}Detected distro: ${DISTRO}${NC}"

# -----------------------------------------------------------
# 1. Check / Install Node.js
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Checking Node.js...${NC}"
if command_exists node; then
    NODE_VER=$(node --version)
    echo -e "  ${GREEN}✅ Node.js ${NODE_VER} found${NC}"
else
    echo -e "  ${YELLOW}📦 Installing Node.js via NodeSource...${NC}"
    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$DISTRO" == "fedora" || "$DISTRO" == "rhel" || "$DISTRO" == "centos" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo dnf install -y nodejs
    elif [[ "$DISTRO" == "arch" || "$DISTRO" == "manjaro" ]]; then
        sudo pacman -S --noconfirm nodejs npm
    else
        echo -e "  ${RED}❌ Could not auto-install Node.js. Please install manually: https://nodejs.org/${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✅ Node.js $(node --version) installed${NC}"
fi

# -----------------------------------------------------------
# 2. Check / Install Python 3.11+
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Checking Python...${NC}"
PYTHON_CMD=""
for cmd in python3.11 python3.12 python3.13 python3; do
    if command_exists "$cmd"; then
        PY_VER=$($cmd --version 2>&1 | grep -oP '3\.\d+')
        PY_MINOR=$(echo "$PY_VER" | cut -d. -f2)
        if [ "$PY_MINOR" -ge 11 ] 2>/dev/null; then
            PYTHON_CMD="$cmd"
            echo -e "  ${GREEN}✅ $($cmd --version) found${NC}"
            break
        fi
    fi
done

if [ -z "$PYTHON_CMD" ]; then
    echo -e "  ${YELLOW}📦 Installing Python 3.11...${NC}"
    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" ]]; then
        sudo add-apt-repository -y ppa:deadsnakes/ppa
        sudo apt-get update
        sudo apt-get install -y python3.11 python3.11-venv python3.11-dev
        PYTHON_CMD="python3.11"
    elif [[ "$DISTRO" == "fedora" ]]; then
        sudo dnf install -y python3.11 python3.11-devel
        PYTHON_CMD="python3.11"
    elif [[ "$DISTRO" == "arch" || "$DISTRO" == "manjaro" ]]; then
        sudo pacman -S --noconfirm python
        PYTHON_CMD="python3"
    else
        echo -e "  ${RED}❌ Please install Python 3.11+ manually${NC}"
        exit 1
    fi
    echo -e "  ${GREEN}✅ $($PYTHON_CMD --version) installed${NC}"
fi

# -----------------------------------------------------------
# 3. Check / Install FFmpeg
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Checking FFmpeg...${NC}"
if command_exists ffmpeg; then
    echo -e "  ${GREEN}✅ FFmpeg found${NC}"
else
    echo -e "  ${YELLOW}📦 Installing FFmpeg...${NC}"
    if [[ "$DISTRO" == "ubuntu" || "$DISTRO" == "debian" ]]; then
        sudo apt-get install -y ffmpeg
    elif [[ "$DISTRO" == "fedora" ]]; then
        sudo dnf install -y ffmpeg
    elif [[ "$DISTRO" == "arch" || "$DISTRO" == "manjaro" ]]; then
        sudo pacman -S --noconfirm ffmpeg
    fi
    echo -e "  ${GREEN}✅ FFmpeg installed${NC}"
fi

# -----------------------------------------------------------
# 4. Detect GPU
# -----------------------------------------------------------
echo -e "${YELLOW}[4/6] Detecting GPU...${NC}"
GPU_TYPE="cpu"

# Check NVIDIA
if command_exists nvidia-smi; then
    NVIDIA_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
    if [ -n "$NVIDIA_NAME" ]; then
        echo -e "  ${GREEN}🟢 NVIDIA GPU detected: ${NVIDIA_NAME}${NC}"
        GPU_TYPE="cuda"
    fi
fi

# Check AMD ROCm
if [ "$GPU_TYPE" = "cpu" ] && [ -d "/dev/kfd" ]; then
    echo -e "  ${GREEN}🟢 AMD GPU detected (ROCm)${NC}"
    GPU_TYPE="rocm"
fi

if [ "$GPU_TYPE" = "cpu" ]; then
    echo -e "  ${YELLOW}⚠️  No dedicated GPU detected — will use CPU${NC}"
fi

# -----------------------------------------------------------
# 5. Install Backend Dependencies
# -----------------------------------------------------------
echo -e "${YELLOW}[5/6] Setting up backend...${NC}"

# Create virtual environment
if [ ! -d "backend/.venv" ]; then
    echo -e "  ${CYAN}📦 Creating Python virtual environment...${NC}"
    $PYTHON_CMD -m venv backend/.venv
fi

# Activate venv
source backend/.venv/bin/activate

# Install PyTorch based on GPU type
echo -e "  ${CYAN}📦 Installing PyTorch (${GPU_TYPE})...${NC}"
case "$GPU_TYPE" in
    cuda)
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cu121
        ;;
    rocm)
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/rocm6.0
        ;;
    *)
        pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
        ;;
esac

# Install other requirements
echo -e "  ${CYAN}📦 Installing backend dependencies...${NC}"
pip install -r backend/requirements.txt

deactivate

# -----------------------------------------------------------
# 6. Install Frontend Dependencies
# -----------------------------------------------------------
echo -e "${YELLOW}[6/6] Setting up frontend...${NC}"
cd frontend && npm install && cd ..

# Install root concurrently runner
npm install

# -----------------------------------------------------------
# Create .env if not exists
# -----------------------------------------------------------
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "  ${CYAN}📝 Created .env from template${NC}"

    if [ "$GPU_TYPE" = "cuda" ]; then
        sed -i "s/DEVICE_OVERRIDE=/DEVICE_OVERRIDE=cuda/" .env
    elif [ "$GPU_TYPE" = "rocm" ]; then
        sed -i "s/DEVICE_OVERRIDE=/DEVICE_OVERRIDE=cuda/" .env  # ROCm uses CUDA API
    fi
fi

# -----------------------------------------------------------
# Check Docker (optional)
# -----------------------------------------------------------
if command_exists docker; then
    echo -e "  ${GREEN}✅ Docker found${NC}"

    # Check NVIDIA Container Toolkit
    if [ "$GPU_TYPE" = "cuda" ]; then
        if command_exists nvidia-container-cli; then
            echo -e "  ${GREEN}✅ NVIDIA Container Toolkit found${NC}"
        else
            echo -e "  ${YELLOW}⚠️  NVIDIA Container Toolkit not found.${NC}"
            echo -e "  ${YELLOW}  Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html${NC}"
        fi
    fi
else
    echo -e "  ${YELLOW}⚠️  Docker not found (optional — needed only for Docker deployment)${NC}"
fi

# -----------------------------------------------------------
# Done!
# -----------------------------------------------------------
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ Unweave installation complete!        ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "GPU: ${CYAN}${GPU_TYPE}${NC}"
echo ""
echo -e "${YELLOW}To start the app:${NC}"
echo "  npm run dev         (frontend + Docker backend)"
echo ""
echo -e "${YELLOW}To run backend natively (without Docker):${NC}"
echo "  source backend/.venv/bin/activate"
echo "  cd backend && python -m uvicorn main:app --reload"
echo ""
