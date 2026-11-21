# The web app as one container for Render. The model is not in it: it runs in the worker on the
# laptop (`npm run worker`), which reads the same Neon database. Migrations run from the laptop too.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Only so the build can load the auth module; the real secret is set on Render at run time.
RUN BETTER_AUTH_SECRET=build-time-placeholder-not-used-at-run-time npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# The sample timetable a plan can start from is read at run time.
COPY --from=build /app/db ./db
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
