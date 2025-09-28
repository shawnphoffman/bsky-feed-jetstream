# FROM node:20-alpine AS base
FROM node:22-alpine AS base

# ==========================
# DEPENDENCIES
# ==========================
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat make gcc g++ python3
WORKDIR /app

# Copy files and install packages
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./

# Install dependencies with cache mount for better performance
RUN --mount=type=cache,target=/root/.yarn \
	yarn --frozen-lockfile

# ==========================
# RUNNER
# ==========================
FROM base AS runner
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

ENV NODE_ENV=production

# Install pm2
RUN npm install pm2 tsx -g

COPY src/ ecosystem-docker.config.js ./
# COPY src/ .env ecosystem-docker.config.js ./
# COPY src/ ./src
# COPY .env .

EXPOSE 3000
ENV PORT=3000

# CMD ["yarn" , "start"]
# CMD ["pm2-runtime", "src/index.ts"]
CMD ["pm2-runtime", "ecosystem-docker.config.js"]
