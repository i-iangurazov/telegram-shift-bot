FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --no-frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml* ./
COPY tsconfig.json ./
COPY next-env.d.ts ./
COPY src ./src
COPY prisma ./prisma
RUN pnpm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY package.json ./
CMD ["pnpm", "start"]
