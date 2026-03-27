# Multi-stage build for optimal image size
# Stage 1: Install dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app

# Install dependencies for frontend
COPY package*.json ./
RUN npm ci --only=production

# Install dependencies for backend
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --only=production

# Stage 2: Build (copy application files and pre-compress WASM)
FROM node:18-alpine AS build
WORKDIR /app

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/server/node_modules ./server/node_modules

# Copy application files
COPY index.html ./
COPY css ./css
COPY js ./js
COPY libs ./libs
COPY server ./server

# Pre-compress WASM files (38MB → ~10MB) to avoid Cloud Run 32MB HTTP/1.1 limit
# and eliminate runtime CPU cost of compression
RUN apk add --no-cache gzip && \
    find libs -name "*.wasm" -size +1000k -exec gzip -k -9 {} \;

# Stage 3: Production image
FROM node:18-alpine AS production
WORKDIR /app

# Install dumb-init for proper signal handling in containers
RUN apk add --no-cache dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy dependencies and application files
COPY --from=build --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=nodejs:nodejs /app/server ./server
COPY --from=build --chown=nodejs:nodejs /app/index.html ./
COPY --from=build --chown=nodejs:nodejs /app/css ./css
COPY --from=build --chown=nodejs:nodejs /app/js ./js
COPY --from=build --chown=nodejs:nodejs /app/libs ./libs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Switch to non-root user
USER nodejs

# Expose the port (Cloud Run uses container port 8080 by default)
EXPOSE 8080

# Use dumb-init to handle signals properly and start the server
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/server.js"]
