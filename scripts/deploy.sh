#!/bin/bash
set -e
IMAGE_URL=$1
CONTAINER="zynk-backend"
MODEL_CACHE="/home/zynk/app/model_cache"
 
echo "[deploy] deploying $IMAGE_URL"
mkdir -p $MODEL_CACHE
 
# Auth with Artifact Registry using VM identity (no keys needed)
gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
 
# Pull new image
docker pull $IMAGE_URL
 
# Stop old container
if docker ps -q --filter "name=$CONTAINER" | grep -q .; then
  docker stop $CONTAINER && docker rm $CONTAINER
fi
 
# Start new container
docker run -d \
  --name $CONTAINER \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  --env-file /home/zynk/app/.env \
  -v $MODEL_CACHE:/app/model_cache \
  $IMAGE_URL
 
# Wait up to 60s for health check
for i in $(seq 1 12); do
  if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
    echo "[deploy] healthy! done."
    docker image prune -f
    exit 0
  fi
  echo "[deploy] attempt $i/12..."
  sleep 5
done
 
echo "[deploy] FAILED"
docker stop $CONTAINER || true
docker rm $CONTAINER || true
exit 1
