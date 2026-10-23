FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY dist ./dist
COPY server ./server
ENV PORT=8787
ENV LEAGUE_DB_PATH=/data/league.sqlite
EXPOSE 8787
CMD ["node", "server/server.mjs"]
