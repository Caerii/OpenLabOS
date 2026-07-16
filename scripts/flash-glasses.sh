#!/bin/bash
# ─── LabOS First-Time Flash Script ───
#
# Usage: ./scripts/flash-glasses.sh <glasses-ip>
#
# This script:
# 1. Connects to glasses via WiFi ADB
# 2. Builds the device APKs (or downloads from latest release)
# 3. Installs all LabOS modules
# 4. Claims device owner
# 5. Disables stock MentraOS
#
# Prerequisites: ADB on PATH, JDK 17 (for building from source)

set -e

GLASSES_IP="${1:-}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE_DIR="$REPO_ROOT/device"
PREBUILT_DIR="$DEVICE_DIR/prebuilt/labos-debug"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[LabOS]${NC} $1"; }
warn() { echo -e "${YELLOW}[LabOS]${NC} $1"; }
err() { echo -e "${RED}[LabOS]${NC} $1" >&2; }

if [ -z "$GLASSES_IP" ]; then
  err "Usage: ./scripts/flash-glasses.sh <glasses-ip>"
  err ""
  err "Find your glasses IP:"
  err "  - Check your router's connected devices"
  err "  - Or scan: nmap -p 5555 192.168.1.0/24"
  exit 1
fi

# ─── Connect via ADB ───
log "Connecting to glasses at $GLASSES_IP:5555..."
adb connect "$GLASSES_IP:5555"
sleep 2

if ! adb devices | grep -q "$GLASSES_IP"; then
  err "Failed to connect. Is the glasses on WiFi and ADB enabled?"
  exit 1
fi
log "Connected!"

# ─── Build APKs ───
if [ -f "$PREBUILT_DIR/core-app.apk" ] \
  && [ -f "$PREBUILT_DIR/camera.apk" ] \
  && [ -f "$PREBUILT_DIR/dashboard-device.apk" ] \
  && [ -f "$PREBUILT_DIR/devtools.apk" ]; then
  log "Using prebuilt debug APKs from $PREBUILT_DIR"
  CORE_APK="$PREBUILT_DIR/core-app.apk"
  CAMERA_APK="$PREBUILT_DIR/camera.apk"
  DASHBOARD_APK="$PREBUILT_DIR/dashboard-device.apk"
  DEVTOOLS_APK="$PREBUILT_DIR/devtools.apk"
else
  if [ -d "$DEVICE_DIR/core-app" ]; then
    log "Prebuilt APKs not found; building device APKs from source..."
    cd "$DEVICE_DIR"

    if [ -z "$JAVA_HOME" ]; then
      # Try common JDK 17 locations
      for jdk in /usr/lib/jvm/java-17-* "$HOME/.sdkman/candidates/java/17"* "C:/Users/$USER/scoop/apps/temurin17-jdk/current"; do
        if [ -d "$jdk" ]; then
          export JAVA_HOME="$jdk"
          break
        fi
      done
    fi

    ./gradlew assembleDebug
    cd "$REPO_ROOT"

    CORE_APK="$DEVICE_DIR/core-app/build/outputs/apk/debug/core-app-debug.apk"
    CAMERA_APK="$DEVICE_DIR/camera/build/outputs/apk/debug/camera-debug.apk"
    DASHBOARD_APK="$DEVICE_DIR/dashboard-device/build/outputs/apk/debug/dashboard-device-debug.apk"
    DEVTOOLS_APK="$DEVICE_DIR/devtools/build/outputs/apk/debug/devtools-debug.apk"
  else
    err "Device source and prebuilt APKs are both missing. Clone the full repo or run git lfs pull."
    exit 1
  fi
fi

# ─── Install APKs ───
log "Installing core-app (device owner)..."
adb -s "$GLASSES_IP:5555" install -r "$CORE_APK"

log "Installing camera module..."
adb -s "$GLASSES_IP:5555" install -r "$CAMERA_APK"

log "Installing dashboard-device module..."
adb -s "$GLASSES_IP:5555" install -r "$DASHBOARD_APK"

log "Installing devtools module..."
adb -s "$GLASSES_IP:5555" install -r "$DEVTOOLS_APK"

# ─── Claim Device Owner ───
log "Claiming device owner..."
RESULT=$(adb -s "$GLASSES_IP:5555" shell dpm set-device-owner com.openlab.labos.core/.AdminReceiver 2>&1)

if echo "$RESULT" | grep -q "Success"; then
  log "Device owner claimed successfully!"
elif echo "$RESULT" | grep -q "already set"; then
  warn "Device owner already set (LabOS was previously installed)"
else
  err "Failed to claim device owner: $RESULT"
  err ""
  err "This usually means another app already owns the device."
  err "To fix: Settings → Accounts → remove all accounts, then retry."
  exit 1
fi

# ─── Disable stock MentraOS ───
log "Disabling stock MentraOS app..."
adb -s "$GLASSES_IP:5555" shell pm disable-user --user 0 com.mentra.asg_client 2>/dev/null || true

# ─── Launch LabOS ───
log "Launching LabOS..."
adb -s "$GLASSES_IP:5555" shell am start -n com.openlab.labos.core/.MainActivity

# ─── Verify ───
sleep 2
log ""
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log "  LabOS flashed successfully! 🎉"
log "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
log ""
log "  Glasses IP:  $GLASSES_IP"
log "  Dashboard:   http://$GLASSES_IP:8080"
log "  ADB:         adb connect $GLASSES_IP:5555"
log ""
log "  Open the LabOS dashboard and enter this IP"
log "  to connect via WiFi mode."
log ""
