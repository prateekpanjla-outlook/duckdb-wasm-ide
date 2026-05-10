# Multi-stage build for MCP Generative UI Agent service
# Includes: Python + FastMCP + Prefab + Pyodide (browser WASM) + Deno (server sandbox)

# Stage 1: Bundle JS dependencies (SDK + patched AppBridge)
FROM node:18-alpine AS js-deps
WORKDIR /app
COPY package.json bundle_entry.js bundle_bridge.js ./
RUN npm install
RUN npx esbuild bundle_bridge.js --bundle --format=esm --outfile=static/js/sdk-bundle.js --platform=browser --target=es2020

# Stage 2: Download Pyodide for local serving (zero CDN)
FROM python:3.12-slim AS pyodide-download
WORKDIR /pyodide
RUN apt-get update && apt-get install -y --no-install-recommends curl bzip2 && \
    curl -L -o pyodide.tar.bz2 \
      https://github.com/pyodide/pyodide/releases/download/0.27.4/pyodide-core-0.27.4.tar.bz2 && \
    tar xjf pyodide.tar.bz2 --strip-components=1 && \
    rm pyodide.tar.bz2 && \
    echo "Pyodide downloaded: $(du -sh . | cut -f1)"

# Stage 3: Python dependencies + patch app-bridge.js + patch Pyodide URL
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

# Patch Pyodide CDN URL in prefab_ui's bundled renderer (zero CDN)
RUN python -c "\
import prefab_ui; \
from pathlib import Path; \
p = Path(prefab_ui.__file__).parent / 'renderer' / 'app.html'; \
html = p.read_text(); \
html = html.replace( \
    'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js', \
    '/pyodide/pyodide.js'); \
p.write_text(html); \
print(f'Patched Pyodide URL in app.html ({len(html)} bytes)')"

# Stage 4: Production
FROM python:3.12-slim
WORKDIR /app

# Copy Python packages
COPY --from=py-deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=py-deps /usr/local/bin/uvicorn /usr/local/bin/uvicorn

# Install Deno for server-side Pyodide sandbox
RUN apt-get update && apt-get install -y --no-install-recommends curl unzip && \
    curl -fsSL https://deno.land/install.sh | sh && \
    apt-get remove -y curl unzip && apt-get autoremove -y && rm -rf /var/lib/apt/lists/* && \
    echo "Deno installed: $(/root/.deno/bin/deno --version | head -1)"
ENV DENO_DIR=/root/.deno
ENV PATH="/root/.deno/bin:$PATH"

# Pre-cache Deno npm dependencies (Pyodide) so no CDN fetch at runtime
RUN python -c "\
from pathlib import Path; import prefab_ui; \
print(Path(prefab_ui.__file__).parent / 'sandbox' / 'runner.js')" | \
    xargs -I{} deno cache {} 2>/dev/null || \
    echo "WARNING: Deno pre-cache skipped (non-fatal)"

# Copy application code
COPY . .

# Copy bundled JS from stage 1
COPY --from=js-deps /app/static/js/sdk-bundle.js static/js/sdk-bundle.js
# Copy patched app-bridge.js from stage 3
COPY --from=py-deps /app/app-bridge.js static/js/app-bridge.js
# Copy Pyodide files for browser serving from stage 2
COPY --from=pyodide-download /pyodide static/pyodide/

# Remove build files
RUN rm -rf node_modules bundle_entry.js bundle_bridge.js package.json package-lock.json

ENV PORT=8080
ENV PYTHONIOENCODING=utf-8
ENV PYTHONUNBUFFERED=1

EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
