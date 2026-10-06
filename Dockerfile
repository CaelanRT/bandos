FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20 AS base

FROM base AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/vite.config.js ./
COPY frontend/src ./src
RUN VITE_API_ORIGIN=/ npm run build

FROM base AS backend-dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
# Install native bcrypt on the target platform, never from host node_modules.
RUN npm ci --omit=dev --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app/backend
# Package managers and Node headers are only needed in the build stages.
RUN rm -rf /usr/local/lib/node_modules/npm /opt/yarn-* /usr/local/include/node \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/yarn /usr/local/bin/yarnpkg
COPY --from=backend-dependencies /app/backend/node_modules ./node_modules
COPY backend/package.json ./
COPY backend/app.js backend/config.js backend/frontend.js backend/shutdown.js ./
COPY backend/controllers ./controllers
COPY backend/middleware ./middleware
COPY backend/routes ./routes
COPY backend/utils ./utils
COPY backend/db/index.js ./db/index.js
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
USER node
EXPOSE 3000
ENTRYPOINT ["node"]
CMD ["app.js"]
