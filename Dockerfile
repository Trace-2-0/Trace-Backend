# ────────────────────────────────────────────────────────────
# Trace 1.0 - Production Dockerfile for Express Node.js Backend
# ────────────────────────────────────────────────────────────

# Step 1: Build Stage
FROM node:20-alpine AS builder

# Install OpenSSL required by Prisma Query Engine on Alpine Linux
RUN apk add --no-cache openssl

WORKDIR /app

# Copy dependency specifications
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies and generate Prisma ORM client & schemas
RUN npm install
RUN npx prisma generate

# Copy source code and compile TypeScript to JavaScript (dist/)
COPY . .
RUN npm run build
RUN mkdir -p dist/schemas && cp -r src/schemas/* dist/schemas/ 2>/dev/null || true

# Step 2: Production Runner Stage (Ultra-lightweight image)
FROM node:20-alpine AS runner

# Install OpenSSL for production runtime
RUN apk add --no-cache openssl

WORKDIR /app

# Copy built application assets from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/schemas ./src/schemas

# Expose backend server port
EXPOSE 4000

ENV NODE_ENV=production

# Command to launch production Express server
CMD ["node", "dist/index.js"]
