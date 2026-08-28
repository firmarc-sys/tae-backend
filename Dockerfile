FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY . .
RUN node scripts/normalize-gateway-startup.mjs

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node
# Vedic runtime dependencies are locked by package-lock.json.
# Nested gateway startup budgets are normalized during the image build.
CMD ["npm", "start"]
