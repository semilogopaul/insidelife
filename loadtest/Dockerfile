# Inside Life load test, runs as an Azure Container Apps job. Config comes from env: BASE_URL, PEAK_VUS, RAMP, HOLD (see README.md).
# 1.5.0 is pinned on purpose: the script uses k6/experimental/websockets, which later k6 releases may rename.
FROM grafana/k6:1.5.0
COPY game.js /scripts/game.js
WORKDIR /scripts
# The base image's ENTRYPOINT is `k6`.
CMD ["run", "/scripts/game.js"]
