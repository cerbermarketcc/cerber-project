# CERBER onion gateway

This directory is a standalone Render Docker service. Set its Render root directory to
`onion-gateway`, its health check path to `/healthz`, and define `ONION_HOSTNAME` with the
exact v3 onion hostname.

The service requires two Render secret files:

- `/etc/secrets/cerber-onion-identity.b64` contains base64 text for a gzip-compressed tar
  archive. The archive must contain exactly `hostname`, `hs_ed25519_public_key`, and
  `hs_ed25519_secret_key` at its root.
- `/etc/secrets/cerber-onion-gateway-private.pem` contains an Ed25519 private key in PEM
  format. The corresponding public key belongs in the CERBER backend configuration.

Example identity encoding, run from the private Tor identity directory:

```sh
tar -czf - hostname hs_ed25519_public_key hs_ed25519_secret_key | base64
```

Generate the independent gateway signing key outside the repository:

```sh
openssl genpkey -algorithm Ed25519 -out cerber-onion-gateway-private.pem
openssl pkey -in cerber-onion-gateway-private.pem -pubout -out cerber-onion-gateway-public.pem
```

The gateway signs every proxied request with these headers:

- `x-cerber-onion-version`
- `x-cerber-onion-timestamp`
- `x-cerber-onion-nonce`
- `x-cerber-onion-client`
- `x-cerber-onion-method`
- `x-cerber-onion-url`
- `x-cerber-onion-host`
- `x-cerber-onion-signature`

The signature is Ed25519 over this exact UTF-8 payload:

```text
v1\n{timestamp}\n{nonce}\n{clientId}\n{METHOD}\n{url}\n{onionHost}
```

The gateway never logs request URLs, headers, cookies, or bodies.

Render readiness returns HTTP 200 only after Tor reports 100% bootstrap and the Cerber
backend confirms a correctly signed gateway request. Run exactly one service instance for
this onion identity. The Tor daemon and HTTP gateway use separate operating-system users,
so neither process can read the other process's private key.

Protocol field formats:

- `timestamp` is Unix time in milliseconds.
- `nonce` and `clientId` are 32 lowercase hexadecimal characters.
- `signature` is an Ed25519 signature encoded as unpadded base64url.
