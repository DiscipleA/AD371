# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS build
WORKDIR /app
# Source-only edits preserve this dependency layer.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm cache clean --force && rm -rf /root/.npm
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:a34ab6d7f6f4813f4d0c5469d74685604b962fbdbf5793a7bc7b4998ecb867c8 AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=6 \
  CMD node server/healthcheck.mjs
CMD ["node", "server/server.mjs"]
