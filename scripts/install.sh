#!/usr/bin/env bash
set -euo pipefail

# OpenWind — zero-friction installer
# Usage: curl -fsSL https://openwind.ai/install.sh | bash
#
# What happens:
#   1. Installs the package silently
#   2. Shows native OS dialogs for provider + API key (2 clicks)
#   3. Configures everything automatically
#   4. Opens your AI client
#   User never touches a terminal.

REQUIRED_NODE_MAJOR=22
LABEL="ai.openwind.daemon"

# ─── OS Detection ────────────────────────────────────────────────────────
OS="$(uname -s)"

# ─── Native Dialog Helpers ───────────────────────────────────────────────

dialog_list() {
  local title="$1" prompt="$2"
  shift 2
  local items=("$@")

  if [ "${OS}" = "Darwin" ]; then
    local applescript_list=""
    for item in "${items[@]}"; do
      [ -n "${applescript_list}" ] && applescript_list="${applescript_list}, "
      applescript_list="${applescript_list}\"${item}\""
    done
    osascript -e "choose from list {${applescript_list}} with title \"${title}\" with prompt \"${prompt}\" default items {\"${items[0]}\"}" 2>/dev/null
  elif command -v zenity &>/dev/null; then
    local zenity_items=""
    for item in "${items[@]}"; do
      zenity_items="${zenity_items} ${item}"
    done
    zenity --list --title="${title}" --text="${prompt}" --column="Provider" ${zenity_items} 2>/dev/null
  else
    # Fallback: terminal select
    echo "${prompt}" >&2
    select choice in "${items[@]}"; do
      echo "${choice}"
      break
    done
  fi
}

dialog_password() {
  local title="$1" prompt="$2"

  if [ "${OS}" = "Darwin" ]; then
    osascript -e "
      set apiKey to text returned of (display dialog \"${prompt}\" with title \"${title}\" default answer \"\" with hidden answer)
      return apiKey
    " 2>/dev/null
  elif command -v zenity &>/dev/null; then
    zenity --password --title="${title}" --text="${prompt}" 2>/dev/null
  else
    read -rsp "${prompt}: " key
    echo "${key}"
  fi
}

dialog_notify() {
  local title="$1" message="$2"

  if [ "${OS}" = "Darwin" ]; then
    osascript -e "display notification \"${message}\" with title \"${title}\""
  elif command -v notify-send &>/dev/null; then
    notify-send "${title}" "${message}"
  fi
}

dialog_alert() {
  local title="$1" message="$2"

  if [ "${OS}" = "Darwin" ]; then
    osascript -e "display dialog \"${message}\" with title \"${title}\" buttons {\"OK\"} default button \"OK\"" &>/dev/null
  elif command -v zenity &>/dev/null; then
    zenity --info --title="${title}" --text="${message}" &>/dev/null
  else
    echo "${message}"
  fi
}

open_url() {
  local url="$1"
  if [ "${OS}" = "Darwin" ]; then
    open "${url}" 2>/dev/null || true
  elif command -v xdg-open &>/dev/null; then
    xdg-open "${url}" 2>/dev/null || true
  fi
}

# ─── 1. Check Node.js ───────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  dialog_alert "OpenWind" "Node.js >= ${REQUIRED_NODE_MAJOR} is required.\n\nDownload it from nodejs.org"
  open_url "https://nodejs.org"
  exit 1
fi

NODE_MAJOR="$(node --version | sed 's/v//' | cut -d. -f1)"
if [ "${NODE_MAJOR}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
  dialog_alert "OpenWind" "Node.js >= ${REQUIRED_NODE_MAJOR} required.\nFound: $(node --version)\n\nPlease upgrade."
  exit 1
fi

# ─── 2. Install package ─────────────────────────────────────────────────

npm install -g openwind@latest --silent 2>/dev/null || npm install -g openwind --silent

# ─── 3. Choose provider (native dialog) ─────────────────────────────────

PROVIDER=$(dialog_list "OpenWind Setup" "Choose your AI provider:" \
  "Anthropic (recommended)" \
  "OpenAI" \
  "Google" \
  "Ollama (local)")

# Normalize provider name
case "${PROVIDER}" in
  *Anthropic*) PROVIDER="anthropic" ;;
  *OpenAI*)    PROVIDER="openai" ;;
  *Google*)    PROVIDER="google" ;;
  *Ollama*)    PROVIDER="ollama" ;;
  *)
    # User cancelled
    exit 0
    ;;
esac

# ─── 4. Get API key (native dialog) ─────────────────────────────────────

API_KEY=""
if [ "${PROVIDER}" != "ollama" ]; then
  case "${PROVIDER}" in
    anthropic) KEY_URL="https://console.anthropic.com/settings/keys" ;;
    openai)    KEY_URL="https://platform.openai.com/api-keys" ;;
    google)    KEY_URL="https://aistudio.google.com/apikey" ;;
  esac

  # Open the API key page so user can copy their key
  open_url "${KEY_URL}"

  API_KEY=$(dialog_password "OpenWind Setup" "Paste your ${PROVIDER} API key:")

  if [ -z "${API_KEY}" ]; then
    dialog_alert "OpenWind" "No API key provided. Setup cancelled."
    exit 0
  fi
fi

# ─── 5. Run silent setup ────────────────────────────────────────────────

SETUP_ARGS="--provider ${PROVIDER}"
[ -n "${API_KEY}" ] && SETUP_ARGS="${SETUP_ARGS} --api-key ${API_KEY}"

if ! openwind setup ${SETUP_ARGS} 2>/dev/null; then
  dialog_alert "OpenWind" "Setup failed. Please try again or run:\nopenwind onboard"
  exit 1
fi

# ─── 6. Start daemon ────────────────────────────────────────────────────

if [ "${OS}" = "Darwin" ]; then
  PLIST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
  if [ -f "${PLIST}" ]; then
    launchctl unload -w "${PLIST}" 2>/dev/null || true
    launchctl load -w "${PLIST}" 2>/dev/null || true
  fi
elif [ "${OS}" = "Linux" ]; then
  UNIT="${HOME}/.config/systemd/user/openwind.service"
  if [ -f "${UNIT}" ]; then
    systemctl --user daemon-reload 2>/dev/null || true
    systemctl --user enable --now openwind 2>/dev/null || true
  fi
fi

# ─── 7. Done ─────────────────────────────────────────────────────────────

dialog_notify "OpenWind" "Installation complete. Restart your AI client."

dialog_alert "OpenWind" "Setup complete!\n\nOpenWind is now connected to your AI clients.\nRestart Claude Desktop or Cursor to get started.\n\nhttps://openwind.ai"
