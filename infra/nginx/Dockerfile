# syntax=docker/dockerfile:1.7
# Inside Life gateway for Azure Container Apps. Build context: infra/nginx
#
#   docker build -t insidelife-gateway infra/nginx
#   docker run --rm -p 8080:8080 \
#     -e API_UPSTREAM=http://api -e WEB_UPSTREAM=http://web -e MEDIA_ORIGIN=https://media.insidelife.online \
#     insidelife-gateway
#
# Non-root (nginx-unprivileged runs as uid 101 and listens on 8080). The image's entrypoint renders
# /etc/nginx/templates/*.template into /etc/nginx/conf.d with envsubst at start; only the three variables below are
# substituted, so nginx's own $variables are left alone. No secrets live here.
FROM nginxinc/nginx-unprivileged:1.31.6-alpine

ENV NGINX_ENVSUBST_FILTER='^(API_UPSTREAM|WEB_UPSTREAM|MEDIA_ORIGIN)$'

COPY default.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf proxy-params.conf /etc/nginx/snippets/

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
