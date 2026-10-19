#!/bin/sh
set -eu

# Only this one variable is substituted; every other $ in nginx.conf is nginx's own.
: "${API_UPSTREAM:=dashboard-api:3399}"
export API_UPSTREAM

envsubst '$API_UPSTREAM' < /etc/nginx/templates/nginx.conf > /etc/nginx/conf.d/default.conf
exec nginx -g "daemon off;"
