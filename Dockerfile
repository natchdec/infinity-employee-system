FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV COREPACK_HOME=/opt/corepack
ENV NEXT_TELEMETRY_DISABLED=1
RUN mkdir -p "$COREPACK_HOME" && \
    corepack enable && \
    corepack prepare pnpm@11.22.0 --activate && \
    chmod -R a+rX "$COREPACK_HOME"
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
ENV APP_ENV=uat
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm build

FROM base AS runtime
ENV NODE_ENV=production
ENV HOME=/app
RUN groupadd --system --gid 10001 infinity && \
    useradd --system --uid 10001 --gid infinity --home-dir /app --shell /usr/sbin/nologin infinity && \
    mkdir -p /app/.aws && chown -R infinity:infinity /app
COPY --from=build --chown=infinity:infinity /app /app
USER infinity
EXPOSE 3000
CMD ["pnpm","start"]
