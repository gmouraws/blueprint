#!/usr/bin/env bash
set -euo pipefail
# Pinned official server; synthetic media and loopback-only credentials.
mkdir -p .generated/livekit
curl --fail --show-error --silent --location --retry 2 --max-time 90 \
  https://github.com/livekit/livekit/releases/download/v1.13.10/livekit_1.13.10_linux_amd64.tar.gz \
  --output .generated/livekit/server.tar.gz
printf '%s\n' 'c25a3e45fb922e9a93c6443d10c0ed041ba64342097e38632331736630283165  .generated/livekit/server.tar.gz' | sha256sum --check --strict
tar -xzf .generated/livekit/server.tar.gz -C .generated/livekit livekit-server
cat > .generated/livekit/test.yaml <<'YAML'
port: 7880
bind_addresses: [127.0.0.1]
rtc:
  node_ip: 127.0.0.1
  tcp_port: 7881
  port_range_start: 50100
  port_range_end: 50130
  use_external_ip: false
  enable_loopback_candidate: true
keys:
  blueprint-test: local-test-secret-not-a-production-credential
logging:
  level: error
YAML
.generated/livekit/livekit-server --config .generated/livekit/test.yaml > .generated/livekit/server.log 2>&1 &
stream_test_server_pid=$!
trap 'kill "$stream_test_server_pid" 2>/dev/null || true' EXIT
for attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:7880/ >/dev/null; then break; fi
  kill -0 "$stream_test_server_pid"
  sleep 1
done
npx playwright test --config playwright.transport.config.ts guest-stream.spec.ts
