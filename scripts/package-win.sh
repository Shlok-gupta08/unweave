#!/usr/bin/env bash
# ============================================================
# Unweave — Windows Native App & .exe Packager
# Builds standalone Unweave.exe and portable distribution package
# ============================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-desktop"
WIN_APP_NAME="Unweave"
WIN_DIST_DIR="$DIST_DIR/Unweave-win32-x64"
ELECTRON_VERSION="33.2.1"
ELECTRON_WIN_ZIP="$DIST_DIR/electron-v${ELECTRON_VERSION}-win32-x64.zip"
ELECTRON_WIN_URL="https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip"

echo ""
echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   Unweave — Native Windows App (.exe) Packager     ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo ""

# -----------------------------------------------------------
# 1. Build Frontend Production Assets
# -----------------------------------------------------------
echo -e "${YELLOW}[1/5] Compiling Frontend Assets (React 19 + Vite)...${NC}"
cd "$ROOT_DIR/frontend"
npm run build
echo -e "  ${GREEN}✅ Frontend compilation complete${NC}"

# -----------------------------------------------------------
# 2. Prepare Windows Distribution Directory
# -----------------------------------------------------------
echo -e "${YELLOW}[2/5] Setting up Windows runtime environment...${NC}"
mkdir -p "$DIST_DIR"

if [ ! -f "$ELECTRON_WIN_ZIP" ]; then
    echo -e "  Downloading Electron v${ELECTRON_VERSION} for Windows x64..."
    curl -L --retry 3 --output "$ELECTRON_WIN_ZIP" "$ELECTRON_WIN_URL"
fi

rm -rf "$WIN_DIST_DIR"
mkdir -p "$WIN_DIST_DIR"

echo -e "  Extracting Windows runtime..."
unzip -q "$ELECTRON_WIN_ZIP" -d "$WIN_DIST_DIR"
rm -f "$ELECTRON_WIN_ZIP"

# -----------------------------------------------------------
# 3. Assemble Windows Executable & Resources
# -----------------------------------------------------------
echo -e "${YELLOW}[3/5] Assembling ${WIN_APP_NAME}.exe and application files...${NC}"

# Rename electron.exe to Unweave.exe
if [ -f "$WIN_DIST_DIR/electron.exe" ]; then
    mv "$WIN_DIST_DIR/electron.exe" "$WIN_DIST_DIR/${WIN_APP_NAME}.exe"
fi

# Clean default electron app
rm -f "$WIN_DIST_DIR/resources/default_app.asar"

# Install app code
APP_RESOURCES="$WIN_DIST_DIR/resources/app"
mkdir -p "$APP_RESOURCES"

cp "$ROOT_DIR/desktop/main.js" "$APP_RESOURCES/main.js"
cp "$ROOT_DIR/desktop/preload.js" "$APP_RESOURCES/preload.js"
cp "$ROOT_DIR/desktop/package.json" "$APP_RESOURCES/package.json"

mkdir -p "$APP_RESOURCES/frontend"
cp -R "$ROOT_DIR/frontend/dist" "$APP_RESOURCES/frontend/dist"

# -----------------------------------------------------------
# 4. Embed Python Backend Sources
# -----------------------------------------------------------
echo -e "${YELLOW}[4/5] Embedding Python AI Backend Source Code...${NC}"
BACKEND_APP_DIR="$WIN_DIST_DIR/resources/backend"
mkdir -p "$BACKEND_APP_DIR"
mkdir -p "$BACKEND_APP_DIR/static_stems"
mkdir -p "$BACKEND_APP_DIR/temp_audio"
mkdir -p "$BACKEND_APP_DIR/models"

cp "$ROOT_DIR/backend/main.py" "$BACKEND_APP_DIR/main.py"
cp "$ROOT_DIR/backend/worker.py" "$BACKEND_APP_DIR/worker.py"
cp "$ROOT_DIR/backend/requirements.txt" "$BACKEND_APP_DIR/requirements.txt"

echo -e "  ${GREEN}✅ Application resources and backend embedded successfully${NC}"

# -----------------------------------------------------------
# 5. Create Standalone Windows Distribution Archive
# -----------------------------------------------------------
echo -e "${YELLOW}[5/5] Creating Windows Distribution Archive...${NC}"
WIN_ZIP_OUTPUT="$DIST_DIR/${WIN_APP_NAME}-Windows-x64.zip"
rm -f "$WIN_ZIP_OUTPUT"

cd "$DIST_DIR"
zip -rq "$WIN_ZIP_OUTPUT" "Unweave-win32-x64"

echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}   🎉 Windows Packaging Complete!                   ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo ""
echo -e "  📂 Windows App Folder: ${CYAN}$WIN_DIST_DIR${NC}"
echo -e "  ⚡ Executable Binary:  ${CYAN}$WIN_DIST_DIR/${WIN_APP_NAME}.exe${NC}"
echo -e "  📦 Distribution ZIP:   ${CYAN}$WIN_ZIP_OUTPUT${NC} ($(du -sh "$WIN_ZIP_OUTPUT" | cut -f1))"
echo ""
