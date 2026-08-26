FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

USER node
CMD ["npm", "start"]
