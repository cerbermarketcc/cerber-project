#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

readonly IDENTITY_SECRET="/etc/secrets/cerber-onion-identity.b64"
readonly SIGNING_SECRET="/etc/secrets/cerber-onion-gateway-private.pem"
readonly RUNTIME_DIR="/run/cerber-onion"
readonly STAGING_DIR="${RUNTIME_DIR}/identity-staging"
readonly DECODED_ARCHIVE="${RUNTIME_DIR}/identity.tar.gz"
readonly HIDDEN_SERVICE_DIR="/var/lib/tor/cerber"
readonly RUNTIME_SIGNING_KEY="${RUNTIME_DIR}/gateway-private.pem"
readonly TOR_READY_FILE="${RUNTIME_DIR}/tor-ready"
readonly TOR_CONFIG="/app/torrc"

die() {
  printf 'onion gateway startup failed: %s\n' "$1" >&2
  exit 1
}

[[ "${EUID}" -eq 0 ]] || die "entrypoint must run as root"
[[ -n "${ONION_HOSTNAME:-}" ]] || die "ONION_HOSTNAME is required"
[[ "${ONION_HOSTNAME}" =~ ^cerber[a-z2-7]{50}\.onion$ ]] || die "ONION_HOSTNAME is not the expected v3 vanity hostname"
[[ -r "${IDENTITY_SECRET}" ]] || die "missing identity secret file"
[[ -r "${SIGNING_SECRET}" ]] || die "missing gateway signing key file"

install -d -m 0711 -o root -g root "${RUNTIME_DIR}"
rm -f -- "${TOR_READY_FILE}"
rm -rf -- "${STAGING_DIR}"
install -d -m 0700 "${STAGING_DIR}"

identity_size="$(stat -c '%s' "${IDENTITY_SECRET}")"
[[ "${identity_size}" -gt 0 && "${identity_size}" -le 2097152 ]] || die "identity secret has an invalid size"

base64 --decode "${IDENTITY_SECRET}" > "${DECODED_ARCHIVE}" || die "identity secret is not valid base64"

archive_expanded_size="$(
  (
    set +o pipefail
    gzip -dc "${DECODED_ARCHIVE}" 2>/dev/null \
      | head -c 65537 \
      | wc -c
  )
)"
[[ "${archive_expanded_size}" -gt 0 && "${archive_expanded_size}" -le 65536 ]] \
  || die "identity archive expands beyond the allowed size"

tar -tzf "${DECODED_ARCHIVE}" >/dev/null 2>&1 || die "identity secret does not contain a valid tar.gz archive"

hostname_count=0
public_count=0
secret_count=0
hostname_entry=''
public_entry=''
secret_entry=''
while IFS= read -r archive_entry; do
  normalized="${archive_entry#./}"
  case "${normalized}" in
    ""|".") ;;
    hostname)
      hostname_count=$((hostname_count + 1))
      hostname_entry="${archive_entry}"
      ;;
    hs_ed25519_public_key)
      public_count=$((public_count + 1))
      public_entry="${archive_entry}"
      ;;
    hs_ed25519_secret_key)
      secret_count=$((secret_count + 1))
      secret_entry="${archive_entry}"
      ;;
    *) die "identity archive contains an unexpected entry" ;;
  esac
done < <(tar -tzf "${DECODED_ARCHIVE}")

[[ "${hostname_count}" -eq 1 && "${public_count}" -eq 1 && "${secret_count}" -eq 1 ]] \
  || die "identity archive must contain exactly one hostname and one public/private Tor key pair"

archive_member_size() {
  local archive_member="$1"
  local byte_limit="$2"

  (
    set +o pipefail
    tar -xOzf "${DECODED_ARCHIVE}" -- "${archive_member}" 2>/dev/null \
      | head -c "${byte_limit}" \
      | wc -c
  )
}

hostname_size="$(archive_member_size "${hostname_entry}" 65)"
public_size="$(archive_member_size "${public_entry}" 65)"
secret_size="$(archive_member_size "${secret_entry}" 97)"

[[ "${hostname_size}" -eq 63 || "${hostname_size}" -eq 64 ]] \
  || die "identity hostname has an invalid expanded size"
[[ "${public_size}" -eq 64 ]] || die "identity public key has an invalid expanded size"
[[ "${secret_size}" -eq 96 ]] || die "identity secret key has an invalid expanded size"

tar -xOzf "${DECODED_ARCHIVE}" -- "${hostname_entry}" > "${STAGING_DIR}/hostname" \
  || die "could not read identity hostname"
tar -xOzf "${DECODED_ARCHIVE}" -- "${public_entry}" > "${STAGING_DIR}/hs_ed25519_public_key" \
  || die "could not read identity public key"
tar -xOzf "${DECODED_ARCHIVE}" -- "${secret_entry}" > "${STAGING_DIR}/hs_ed25519_secret_key" \
  || die "could not read identity secret key"

for identity_file in hostname hs_ed25519_public_key hs_ed25519_secret_key; do
  [[ -f "${STAGING_DIR}/${identity_file}" && ! -L "${STAGING_DIR}/${identity_file}" ]] \
    || die "identity archive entries must be regular files"
done

node /app/gateway.mjs --validate-identity "${STAGING_DIR}" "${ONION_HOSTNAME}" \
  || die "Tor identity validation failed"

install -d -m 0700 -o debian-tor -g debian-tor "${HIDDEN_SERVICE_DIR}"
install -m 0600 -o debian-tor -g debian-tor "${STAGING_DIR}/hs_ed25519_public_key" "${HIDDEN_SERVICE_DIR}/hs_ed25519_public_key"
install -m 0600 -o debian-tor -g debian-tor "${STAGING_DIR}/hs_ed25519_secret_key" "${HIDDEN_SERVICE_DIR}/hs_ed25519_secret_key"
printf '%s\n' "${ONION_HOSTNAME}" > "${HIDDEN_SERVICE_DIR}/hostname"
chown debian-tor:debian-tor "${HIDDEN_SERVICE_DIR}/hostname"
chmod 0600 "${HIDDEN_SERVICE_DIR}/hostname"

install -m 0600 -o cerber-gateway -g cerber-gateway "${SIGNING_SECRET}" "${RUNTIME_SIGNING_KEY}"

[[ "$(stat -c '%a' "${HIDDEN_SERVICE_DIR}")" == "700" ]] || die "hidden service directory mode validation failed"
for installed_file in hostname hs_ed25519_public_key hs_ed25519_secret_key; do
  [[ "$(stat -c '%a' "${HIDDEN_SERVICE_DIR}/${installed_file}")" == "600" ]] \
    || die "hidden service key mode validation failed"
  [[ "$(stat -c '%U:%G' "${HIDDEN_SERVICE_DIR}/${installed_file}")" == "debian-tor:debian-tor" ]] \
    || die "hidden service key ownership validation failed"
done
[[ "$(stat -c '%a' "${RUNTIME_SIGNING_KEY}")" == "600" ]] || die "gateway signing key mode validation failed"
[[ "$(stat -c '%U:%G' "${RUNTIME_SIGNING_KEY}")" == "cerber-gateway:cerber-gateway" ]] \
  || die "gateway signing key ownership validation failed"

rm -rf -- "${STAGING_DIR}"
rm -f -- "${DECODED_ARCHIVE}"

tor --verify-config -f "${TOR_CONFIG}" >/dev/null || die "Tor configuration validation failed"

gateway_pid=''
tor_pid=''
shutdown_requested=0

stop_children() {
  shutdown_requested=1
  [[ -z "${gateway_pid}" ]] || kill -TERM "${gateway_pid}" 2>/dev/null || true
  [[ -z "${tor_pid}" ]] || kill -TERM "${tor_pid}" 2>/dev/null || true
}

trap stop_children TERM INT EXIT

setpriv --reuid=cerber-gateway --regid=cerber-gateway --init-groups \
  env NODE_OPTIONS="--max-http-header-size=16384" \
  node /app/gateway.mjs &
gateway_pid=$!
if [[ "${shutdown_requested}" -eq 1 ]]; then
  stop_children
  exit 143
fi

tor -f "${TOR_CONFIG}" > >(
  while IFS= read -r tor_line; do
    printf '%s\n' "${tor_line}"
    if [[ "${tor_line}" == *"Bootstrapped 100%"* && ! -e "${TOR_READY_FILE}" ]]; then
      install -m 0444 -o root -g root /dev/null "${TOR_READY_FILE}"
    fi
  done
) 2>&1 &
tor_pid=$!
if [[ "${shutdown_requested}" -eq 1 ]]; then
  stop_children
  exit 143
fi

set +e
wait -n "${gateway_pid}" "${tor_pid}"
first_status=$?
set -e

stop_children
(
  sleep 10
  [[ -z "${gateway_pid}" ]] || kill -KILL "${gateway_pid}" 2>/dev/null || true
  [[ -z "${tor_pid}" ]] || kill -KILL "${tor_pid}" 2>/dev/null || true
) &
shutdown_watchdog_pid=$!
set +e
wait "${gateway_pid}" 2>/dev/null
gateway_status=$?
wait "${tor_pid}" 2>/dev/null
tor_status=$?
kill -TERM "${shutdown_watchdog_pid}" 2>/dev/null || true
wait "${shutdown_watchdog_pid}" 2>/dev/null || true
set -e

if [[ "${first_status}" -ne 0 ]]; then
  exit "${first_status}"
fi
if [[ "${gateway_status}" -ne 0 ]]; then
  exit "${gateway_status}"
fi
exit "${tor_status}"
