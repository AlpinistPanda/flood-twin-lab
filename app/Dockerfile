# Step 9: the production image of the web app. Two stages:
#
#   build   a full Node.js environment that turns the SvelteKit app into plain files
#   serve   only nginx and those files: no Node.js, no node_modules, no source code
#
# The final image contains only the second stage, so it is small and has little to attack.

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:26-slim AS build
WORKDIR /app

# Dependencies first, so Docker can cache them (see api/Dockerfile).
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build /usr/share/nginx/html
EXPOSE 80
