#!/usr/bin/env bash
# Probe local subnets + the workstation's own subnet for a Mentra Live
# dashboard server (port 8080). Reuses the subnets the legacy adb scanner
# walked, plus the local interface subnet auto-detected from the host.
set -u

PORT="${PORT:-8080}"
TIMEOUT="${TIMEOUT:-1}"

# Auto-add the host's own /24 so we always check the workstation's subnet.
auto_subnet() {
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*|Windows_NT)
      ipconfig 2>/dev/null \
        | awk '/IPv4 Address/ {print $NF}' \
        | sed 's/\.[0-9]*$//' ;;
    Darwin)
      ipconfig getifaddr en0 2>/dev/null | sed 's/\.[0-9]*$//' ;;
    *)
      ip -4 addr show 2>/dev/null \
        | awk '/inet / && !/127\./ {split($2,a,"/"); split(a[1],b,"."); print b[1]"."b[2]"."b[3]}' ;;
  esac
}

declare -A SEEN
add() { SEEN["$1"]=1; }

while read -r s; do
  [ -n "$s" ] && add "$s"
done < <(auto_subnet)

for s in 192.168.50 192.168.1 192.168.0 192.168.4 10.0.0 10.0.1; do add "$s"; done

found=()
for sub in "${!SEEN[@]}"; do
  echo "scanning $sub.0/24:$PORT..." >&2
  for i in $(seq 1 254); do
    ip="$sub.$i"
    code=$(curl -s -m "$TIMEOUT" -o /dev/null -w "%{http_code}" \
      "http://$ip:$PORT/api/status" 2>/dev/null)
    case "$code" in
      200|401|403)
        echo "  found: http://$ip:$PORT (HTTP $code)"
        found+=("$ip:$PORT")
        ;;
    esac
  done &
done
wait

if [ "${#found[@]}" -eq 0 ]; then
  echo "no devices found on scanned subnets" >&2
  exit 1
fi
printf '%s\n' "${found[@]}"
