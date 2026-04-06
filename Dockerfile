FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV PREBUILD_DASHBOARD_DB=true
ENV PYTHON_EXECUTABLE=python3

COPY UIUX/package.json UIUX/package-lock.json ./UIUX/
RUN cd UIUX && npm ci --omit=dev --legacy-peer-deps

COPY UIUX/server ./UIUX/server
COPY tasks ./tasks
COPY railway ./railway
COPY tasks/requirements.txt ./tasks/requirements.txt
RUN pip3 install --no-cache-dir -r ./tasks/requirements.txt

COPY data/crm.db.gz ./seed-data/crm.db.gz

EXPOSE 3001

CMD ["node", "railway/start-backend.mjs"]
