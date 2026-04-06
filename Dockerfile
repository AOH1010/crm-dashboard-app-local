FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV PREBUILD_DASHBOARD_DB=true

COPY UIUX/package.json UIUX/package-lock.json ./UIUX/
RUN cd UIUX && npm ci --omit=dev

COPY UIUX/server ./UIUX/server
COPY data/crm.db ./data/crm.db
COPY data/dashboard_sales.db ./data/dashboard_sales.db

EXPOSE 3001

CMD ["npm", "--prefix", "UIUX", "run", "start"]
