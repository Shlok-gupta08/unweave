#!/usr/bin/env bash
# ============================================================
# Unweave — macOS One-Click Installer (Intel + Apple Silicon)
# Usage: chmod +x scripts/install-mac.sh && ./scripts/install-mac.sh
# ============================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${CYAN}============================================${NC}"
echo -e "${CYAN}  Unweave — One-Click Installer (macOS)    ${NC}"
echo -e "${CYAN}============================================${NC}"
echo ""

# -----------------------------------------------------------
# Helper
# -----------------------------------------------------------
command_exists() {
    command -v "$1" &> /dev/null
}

# -----------------------------------------------------------
# Detect Apple Silicon vs Intel
# -----------------------------------------------------------
ARCH=$(uname -m)
IS_APPLE_SILICON=false
if [ "$ARCH" = "arm64" ]; then
    IS_APPLE_SILICON=true
    echo -e "${GREEN}🍎 Apple Silicon detected (${ARCH})${NC}"
else
    echo -e "${CYAN}🖥  Intel Mac detected (${ARCH})${NC}"
fi

# -----------------------------------------------------------
# 1. Check / Install Homebrew
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Checking Homebrew...${NC}"
if command_exists brew; then
    echo -e "  ${GREEN}✅ Homebrew found${NC}"
else
    echo -e "  ${YELLOW}📦 Installing Homebrew...${NC}"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add to PATH for Apple Silicon
    if [ "$IS_APPLE_SILICON" = true ]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
    echo -e "  ${GREEN}✅ Homebrew installed${NC}"
fi

# -----------------------------------------------------------
# 2. Install Node.js
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Checking Node.js...${NC}"
if command_exists node; then
    echo -e "  ${GREEN}✅ Node.js $(node --version) found${NC}"
else
    echo -e "  ${YELLOW}📦 Installing Node.js...${NC}"
    brew install node
    echo -e "  ${GREEN}✅ Node.js $(node --version) installed${NC}"
fi

# -----------------------------------------------------------
# 3. Install Python 3.11+
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Checking Python...${NC}"
PYTHON_CMD=""
for cmd in python3.11 python3.12 python3.13 python3; do
    if command_exists "$cmd"; then
        PY_VER=$($cmd --version 2>&1 | grep -oE '3\.[0-9]+')
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
    brew install python@3.11
    PYTHON_CMD="python3.11"
    echo -e "  ${GREEN}✅ $($PYTHON_CMD --version) installed${NC}"
fi

# -----------------------------------------------------------
# 4. Install FFmpeg
# -----------------------------------------------------------
echo -e "${YELLOW}[4/6] Checking FFmpeg...${NC}"
if command_exists ffmpeg; then
    echo -e "  ${GREEN}✅ FFmpeg found${NC}"
else
    echo -e "  ${YELLOW}📦 Installing FFmpeg...${NC}"
    brew install ffmpeg
    echo -e "  ${GREEN}✅ FFmpeg installed${NC}"
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

source backend/.venv/bin/activate

# Install PyTorch
# Apple Silicon gets MPS support built-in with standard PyTorch
echo -e "  ${CYAN}📦 Installing PyTorch...${NC}"
if [ "$IS_APPLE_SILICON" = true ]; then
    pip install torch torchaudio
    echo -e "  ${GREEN}🟢 MPS (Metal Performance Shaders) GPU acceleration available${NC}"
    GPU_TYPE="mps"
else
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    echo -e "  ${YELLOW}⚠️  Intel Mac — CPU only (no MPS)${NC}"
    GPU_TYPE="cpu"
fi

# Install other requirements
echo -e "  ${CYAN}📦 Installing backend dependencies...${NC}"
pip install -r backend/requirements.txt

deactivate

# -----------------------------------------------------------
# 6. Install Frontend Dependencies
# -----------------------------------------------------------
echo -e "${YELLOW}[6/6] Setting up frontend...${NC}"
cd frontend && npm install && cd ..
npm install

# -----------------------------------------------------------
# Create .env if not exists
# -----------------------------------------------------------
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "  ${CYAN}📝 Created .env from template${NC}"

    if [ "$GPU_TYPE" = "mps" ]; then
        sed -i '' "s/DEVICE_OVERRIDE=/DEVICE_OVERRIDE=mps/" .env
    fi
fi

# -----------------------------------------------------------
# Docker info
# -----------------------------------------------------------
if command_exists docker; then
    echo -e "  ${GREEN}✅ Docker found${NC}"
else
    echo -e "  ${YELLOW}⚠️  Docker not found (optional)${NC}"
    echo -e "  ${YELLOW}  Install Docker Desktop: https://www.docker.com/products/docker-desktop/${NC}"
fi

# -----------------------------------------------------------
# Done!
# -----------------------------------------------------------
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}  ✅ Unweave installation complete!        ${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
if [ "$IS_APPLE_SILICON" = true ]; then
    echo -e "GPU: ${CYAN}Apple Silicon MPS 🚀${NC}"
    echo -e "${GREEN}Your Mac's Neural Engine will accelerate audio separation!${NC}"
else
    echo -e "GPU: ${CYAN}CPU (Intel Mac)${NC}"
fi
echo ""
echo -e "${YELLOW}To start the app:${NC}"
echo "  npm run dev"
echo ""
echo -e "${YELLOW}To run backend natively (recommended for Mac):${NC}"
echo "  source backend/.venv/bin/activate"
echo "  cd backend && python -m uvicorn main:app --reload"
echo ""
