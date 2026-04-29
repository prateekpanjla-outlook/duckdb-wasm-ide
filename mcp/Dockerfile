# Multi-stage build for MCP Agent service

# Stage 1: Bundle JS dependencies (SDK + patched AppBridge)
FROM node:18-alpine AS js-deps
WORKDIR /app
COPY package.json bundle_entry.js bundle_bridge.js ./
RUN npm install
# Bundle SDK modules for browser use
RUN npx esbuild bundle_bridge.js --bundle --format=esm --outfile=static/js/sdk-bundle.js --platform=browser --target=es2020

# Stage 2: Python dependencies + patch app-bridge.js
FROM python:3.12-slim AS py-deps
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Fetch and patch app-bridge.js (replace esm.sh URLs with local paths)
RUN python -c "\
from fastmcp.cli.apps_dev import _fetch_app_bridge_bundle_sync; \
js, _ = _fetch_app_bridge_bundle_sync('1.7.1', '1.25.2'); \
js = js.replace('https://esm.sh/@modelcontextprotocol/sdk@1.25.2/types.js', '/js/sdk-bundle.js'); \
js = js.replace('https://esm.sh/@modelcontextprotocol/sdk@1.25.2/shared/protocol.js', '/js/sdk-bundle.js'); \
open('app-bridge.js', 'w').write(js); \
print(f'Patched app-bridge.js: {len(js)} bytes')"

# Stage 3: Production
FROM python:3.12-slim
WORKDIR /app

# Copy Python packages
COPY --from=py-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=py-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Copy application code
COPY . .

# Copy bundled JS from stage 1
COPY --from=js-deps /app/static/js/sdk-bundle.js static/js/sdk-bundle.js
# Copy patched app-bridge.js from stage 2
COPY --from=py-deps /app/app-bridge.js static/js/app-bridge.js

# Remove build files
RUN rm -rf node_modules bundle_entry.js bundle_bridge.js package.json package-lock.json raw-app-bridge.js

ENV PORT=8080
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
