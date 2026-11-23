#!/bin/sh
set -eu

# Only these variables are substituted; every other $ in nginx.conf is nginx's own.
: "${API_UPSTREAM:=dashboard-api:3399}"
: "${AVATAR_UPSTREAM:=dashboard-avatar:8080}"
export API_UPSTREAM AVATAR_UPSTREAM

envsubst '$API_UPSTREAM $AVATAR_UPSTREAM' < /etc/nginx/templates/nginx.conf > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
