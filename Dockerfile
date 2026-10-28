FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional trusted CA for a corporate build proxy; never copied into the image.
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN npm test

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000 SESSION_DB_PATH=/tmp/clave/sessions.sqlite
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["node", "server.js"]
