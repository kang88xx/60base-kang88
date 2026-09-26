FROM node:24-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=7860
ENV HOST=0.0.0.0
ENV DONGJAKSO_DATA_DIR=/data

COPY --chown=1000:1000 server/ ./server/
# The public UI and its assets stay on Vercel. Only /api routes reach this Space.

USER 1000:1000
EXPOSE 7860
CMD ["node", "server/hf-index.mjs"]
