FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gzip tini tor util-linux \
  && useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin cerber-gateway \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY gateway.mjs entrypoint.sh torrc ./
COPY html ./html

RUN chmod 0755 /app/entrypoint.sh \
  && chmod 0644 /app/gateway.mjs /app/torrc /app/html/*.html \
  && install -d -m 0700 -o debian-tor -g debian-tor /var/lib/tor/data /var/lib/tor/cerber \
  && install -d -m 0711 -o root -g root /run/cerber-onion

ENV NODE_ENV=production \
    ONION_LISTEN_HOST=127.0.0.1 \
    ONION_LISTEN_PORT=8080 \
    ONION_GATEWAY_PRIVATE_KEY=/run/cerber-onion/gateway-private.pem

EXPOSE 10000

ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/app/entrypoint.sh"]
