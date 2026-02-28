#!/bin/sh
# ============================================================
# Unweave Frontend — Docker Entrypoint
# 1. Generates runtime-config.js for the client-side JS
# 2. Generates the final nginx config with envsubst
#    (conditionally includes GPU proxy block)
# 3. Starts nginx
# ============================================================

set -e

# ── 1. Generate runtime config ──
if [ -n "$GPU_BACKEND_URL" ]; then
  GPU_AVAILABLE="true"
else
  GPU_AVAILABLE="false"
fi

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__UNWEAVE_CONFIG__ = {
  gpuAvailable: ${GPU_AVAILABLE}
};
EOF

echo "[entrypoint] CPU backend: ${BACKEND_URL:-not configured}"
echo "[entrypoint] GPU backend: ${GPU_BACKEND_URL:-not configured}"

# ── 2. Generate nginx config ──
# Start with the base config
cat > /etc/nginx/conf.d/default.conf <<NGINX_EOF
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    # ── Gzip Compression ──
    gzip on;
    gzip_vary on;
    gzip_min_length 256;
    gzip_types
        text/plain text/css text/javascript
        application/javascript application/json
        application/xml image/svg+xml;

    # ── Proxy API requests to the CPU backend ──
    location /api/ {
        proxy_pass ${BACKEND_URL}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 100M;
        proxy_redirect off;
    }

    # ── Proxy stem file requests to CPU backend ──
    location /stems/ {
        proxy_pass ${BACKEND_URL}/stems/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_buffering off;
    }
NGINX_EOF

# Conditionally add GPU proxy block only if GPU_BACKEND_URL is set
if [ -n "$GPU_BACKEND_URL" ]; then
cat >> /etc/nginx/conf.d/default.conf <<NGINX_GPU_EOF

    # ── Proxy GPU API requests to the GPU backend ──
    location /gpu-api/ {
        proxy_pass ${GPU_BACKEND_URL}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;
        client_max_body_size 100M;
        proxy_redirect off;
    }
NGINX_GPU_EOF
  echo "[entrypoint] GPU proxy enabled at /gpu-api/"
else
  echo "[entrypoint] GPU proxy disabled (no GPU_BACKEND_URL)"
fi

# Close the server block and add remaining locations
cat >> /etc/nginx/conf.d/default.conf <<'NGINX_TAIL_EOF'

    # ── Cache static assets ──
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # ── SPA Fallback ──
    location / {
        try_files $uri $uri/ /index.html;
    }

    # ── Health check for container orchestrators ──
    location /nginx-health {
        return 200 'ok';
        add_header Content-Type text/plain;
    }
}
NGINX_TAIL_EOF

echo "[entrypoint] Nginx config generated at /etc/nginx/conf.d/default.conf"

# ── 3. Test and start nginx ──
nginx -t
echo "[entrypoint] Nginx config test passed. Starting nginx..."
exec nginx -g "daemon off;"
