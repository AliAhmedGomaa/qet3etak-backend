# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Placeholders live in dist/assets/uploads (nest-cli assets); seed into ./uploads on boot.
COPY --from=build /app/src/assets/uploads ./uploads
EXPOSE 3000
CMD ["node", "dist/src/main.js"]
