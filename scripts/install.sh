#!/usr/bin/env bash
set -euo pipefail

REQUIRED_NODE_MAJOR=22
OPENWIND_DIR="${HOME}/.openwind"
SUBDIRS=("logs" "tmp" "exports" "vault")

log_info() {
  printf "\n[openwind] %s\n" "$1"
}

log_error() {
  printf "\n[openwind] ERROR: %s\n" "$1" >&2
}

check_node_version() {
  if ! command -v node &>/dev/null; then
    log_error "Node.js is not installed. Please install Node.js >= ${REQUIRED_NODE_MAJOR} first."
    log_error "Visit https://nodejs.org/ or use a version manager like fnm/nvm."
    exit 1
  fi

  local node_version
  node_version="$(node --version)"
  local major
  major="$(echo "${node_version}" | sed 's/v//' | cut -d. -f1)"

  if [ "${major}" -lt "${REQUIRED_NODE_MAJOR}" ]; then
    log_error "Node.js >= ${REQUIRED_NODE_MAJOR} is required. Found ${node_version}."
    log_error "Please upgrade Node.js and try again."
    exit 1
  fi

  log_info "Node.js ${node_version} detected."
}

install_openwind() {
  log_info "Installing openwind globally via npm..."
  npm install -g openwind
  log_info "openwind installed successfully."
}

create_directories() {
  log_info "Creating openwind data directory at ${OPENWIND_DIR}..."

  mkdir -p "${OPENWIND_DIR}"
  chmod 700 "${OPENWIND_DIR}"

  for subdir in "${SUBDIRS[@]}"; do
    mkdir -p "${OPENWIND_DIR}/${subdir}"
    chmod 700 "${OPENWIND_DIR}/${subdir}"
  done

  log_info "Directory structure created:"
  for subdir in "${SUBDIRS[@]}"; do
    printf "  %s/%s\n" "${OPENWIND_DIR}" "${subdir}"
  done
}

print_success() {
  printf "\n"
  printf "============================================\n"
  printf "  openwind installed successfully\n"
  printf "============================================\n"
  printf "\n"
  printf "  Data directory: %s\n" "${OPENWIND_DIR}"
  printf "\n"
  printf "  Next steps:\n"
  printf "    1. Run 'openwind onboard' to complete setup\n"
  printf "    2. Configure your AI provider API key\n"
  printf "    3. Start ingesting your data\n"
  printf "\n"
  printf "  Documentation: https://github.com/openwind-dev/openwind\n"
  printf "\n"
}

main() {
  log_info "Starting openwind installation..."
  check_node_version
  install_openwind
  create_directories
  print_success
}

main
