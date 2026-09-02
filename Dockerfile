FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY . .
RUN node scripts/normalize-gateway-startup.mjs \
  && node scripts/enforce-vertex-model-policy.mjs \
  && node scripts/enforce-final-production-gate.mjs \
  && node scripts/verify-vertex-model-policy.mjs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node
# Vedic runtime dependencies are locked by package-lock.json.
# Nested gateway, authorization-edge, capability-driven Vertex model policy, and corrected Ma'at final proof contracts are enforced during image build.
CMD ["npm", "start"]
