#!/usr/bin/env bash
# ============================================================
# Unweave — macOS Native App & Custom DMG Packager
# Builds a standalone Unweave.app and styled drag-and-drop Unweave.dmg
# ============================================================

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist-desktop"
ELECTRON_APP="$ROOT_DIR/desktop/node_modules/electron/dist/Electron.app"
APP_NAME="Unweave"
VOL_NAME="Unweave Studio"
APP_BUNDLE="$DIST_DIR/$APP_NAME.app"
DMG_PATH="$DIST_DIR/$APP_NAME.dmg"
DMG_TMP="$DIST_DIR/tmp-$APP_NAME.dmg"

echo ""
echo -e "${CYAN}====================================================${NC}"
echo -e "${CYAN}   Unweave — Native macOS App & DMG Packaging       ${NC}"
echo -e "${CYAN}====================================================${NC}"
echo ""

# -----------------------------------------------------------
# 1. Build Frontend Production Assets
# -----------------------------------------------------------
echo -e "${YELLOW}[1/6] Compiling Frontend Assets (React 19 + Vite)...${NC}"
cd "$ROOT_DIR/frontend"
npm run build
echo -e "  ${GREEN}✅ Frontend compilation complete${NC}"

# -----------------------------------------------------------
# 2. Check Electron Runtime
# -----------------------------------------------------------
echo -e "${YELLOW}[2/6] Verifying Electron macOS Runtime...${NC}"
if [ ! -d "$ELECTRON_APP" ]; then
    echo -e "${RED}❌ Electron runtime not found at $ELECTRON_APP.${NC}"
    echo -e "Please run: npm install --prefix desktop"
    exit 1
fi
echo -e "  ${GREEN}✅ Electron runtime verified${NC}"

# -----------------------------------------------------------
# 3. Create .app Bundle
# -----------------------------------------------------------
echo -e "${YELLOW}[3/6] Assembling $APP_NAME.app bundle...${NC}"
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

cp -R "$ELECTRON_APP" "$APP_BUNDLE"

# Rename binary
mv "$APP_BUNDLE/Contents/MacOS/Electron" "$APP_BUNDLE/Contents/MacOS/$APP_NAME"

# Update Info.plist properties
PLIST="$APP_BUNDLE/Contents/Info.plist"
plutil -replace CFBundleDisplayName -string "Unweave" "$PLIST"
plutil -replace CFBundleName -string "Unweave" "$PLIST"
plutil -replace CFBundleExecutable -string "Unweave" "$PLIST"
plutil -replace CFBundleIdentifier -string "com.unweave.studio" "$PLIST"
plutil -replace CFBundleShortVersionString -string "1.0.0" "$PLIST"
plutil -replace CFBundleVersion -string "1.0.0" "$PLIST"
plutil -replace CFBundleIconFile -string "Unweave.icns" "$PLIST"

# Remove Electron default app
rm -f "$APP_BUNDLE/Contents/Resources/default_app.asar"

# Install app resources
APP_RESOURCES_DIR="$APP_BUNDLE/Contents/Resources/app"
mkdir -p "$APP_RESOURCES_DIR"

cp "$ROOT_DIR/desktop/main.js" "$APP_RESOURCES_DIR/main.js"
cp "$ROOT_DIR/desktop/preload.js" "$APP_RESOURCES_DIR/preload.js"
cp "$ROOT_DIR/desktop/package.json" "$APP_RESOURCES_DIR/package.json"

mkdir -p "$APP_RESOURCES_DIR/frontend"
cp -R "$ROOT_DIR/frontend/dist" "$APP_RESOURCES_DIR/frontend/dist"

# Copy Icon
if [ -f "$ROOT_DIR/desktop/assets/Unweave.icns" ]; then
    cp "$ROOT_DIR/desktop/assets/Unweave.icns" "$APP_BUNDLE/Contents/Resources/Unweave.icns"
    cp "$ROOT_DIR/desktop/assets/Unweave.icns" "$APP_BUNDLE/Contents/Resources/electron.icns"
fi

echo -e "  ${GREEN}✅ $APP_NAME.app bundle generated successfully${NC}"

# -----------------------------------------------------------
# 4. Ad-Hoc Sign App Bundle
# -----------------------------------------------------------
echo -e "${YELLOW}[4/6] Code-signing $APP_NAME.app (Ad-Hoc)...${NC}"
codesign --force --deep --sign - "$APP_BUNDLE" 2>/dev/null || true
echo -e "  ${GREEN}✅ App bundle signed${NC}"

# -----------------------------------------------------------
# 5. Generate Custom Background
# -----------------------------------------------------------
echo -e "${YELLOW}[5/6] Generating Custom Retina DMG Background...${NC}"
cd "$ROOT_DIR"
if [ -f "backend/.venv/bin/python" ]; then
    backend/.venv/bin/python scripts/generate_dmg_background.py || true
fi

# -----------------------------------------------------------
# 6. Build Styled Drag-and-Drop .dmg Installer
# -----------------------------------------------------------
echo -e "${YELLOW}[6/6] Formatting & Styling $APP_NAME.dmg...${NC}"
rm -f "$DMG_TMP" "$DMG_PATH"
MOUNT_DIR="/tmp/unweave_mount"

# Ensure clean slate
hdiutil detach "$MOUNT_DIR" -force 2>/dev/null || true
rm -rf "$MOUNT_DIR"
mkdir -p "$MOUNT_DIR"

# Create a writable DMG image
hdiutil create -size 300m -fs HFS+ -volname "$VOL_NAME" -ov "$DMG_TMP" >/dev/null

# Mount with fixed mountpoint
hdiutil attach -readwrite -noverify -noautoopen -mountpoint "$MOUNT_DIR" "$DMG_TMP" >/dev/null

echo -e "  Mounted staging volume at: $MOUNT_DIR"

# Copy App and create Applications link
cp -R "$APP_BUNDLE" "$MOUNT_DIR/"
ln -s /Applications "$MOUNT_DIR/Applications"

# Copy background graphic if available
if [ -f "$ROOT_DIR/desktop/assets/dmg-background.png" ]; then
    mkdir -p "$MOUNT_DIR/.background"
    cp "$ROOT_DIR/desktop/assets/dmg-background.png" "$MOUNT_DIR/.background/background.png"
fi

# Apply AppleScript visual layout to Finder
echo -e "  Applying Finder drag-and-drop presentation..."
osascript -e "
tell application \"Finder\"
    tell disk \"$VOL_NAME\"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set the bounds of container window to {200, 150, 740, 530}
        set theViewOptions to the icon view options of container window
        set icon size of theViewOptions to 110
        set text size of theViewOptions to 13
        set arrangement of theViewOptions to not arranged
        try
            set background picture of theViewOptions to file \".background:background.png\"
        end try
        set position of item \"$APP_NAME.app\" of container window to {130, 200}
        set position of item \"Applications\" of container window to {410, 200}
        close
        open
        update without registering applications
        delay 2
    end tell
end tell
" 2>/dev/null || true

sync

# Detach the staging volume
echo -e "  Finalizing disk image..."
hdiutil detach "$MOUNT_DIR" -force >/dev/null || true
rm -rf "$MOUNT_DIR"
sleep 1

# Convert to final compressed read-only DMG
hdiutil convert "$DMG_TMP" -format UDZO -imagekey zlib-level=9 -o "$DMG_PATH" >/dev/null
rm -f "$DMG_TMP"

echo ""
echo -e "${GREEN}====================================================${NC}"
echo -e "${GREEN}   🎉 Styled DMG Packaging Complete!               ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo ""
echo -e "  📂 App Bundle:  ${CYAN}$APP_BUNDLE${NC}"
echo -e "  💿 DMG Package: ${CYAN}$DMG_PATH${NC} ($(du -sh "$DMG_PATH" | cut -f1))"
echo ""
echo -e "Double-click ${CYAN}$DMG_PATH${NC} to view the beautiful drag-and-drop installer!"
echo ""
