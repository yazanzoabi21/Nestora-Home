FROM node:22-alpine AS build
WORKDIR /app
COPY bff/package.json bff/package-lock.json ./
RUN npm ci
COPY bff/tsconfig.json ./
COPY bff/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY bff/package.json bff/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
# Loopback binding expects an ingress/sidecar sharing this network namespace.
CMD ["node", "dist/main.js"]
