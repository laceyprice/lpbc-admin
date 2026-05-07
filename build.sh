#!/bin/bash
# Usage: ./build.sh v5
# Builds and pushes laceynprice/lpbc-admin with real NEXT_PUBLIC_ vars baked in.

TAG=${1:-latest}

docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://hwctwegwhucymqqkcpvp.supabase.co \
  "--build-arg=NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3Y3R3ZWd3aHVjeW1xcWtjcHZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzNjE0MjYsImV4cCI6MjA5MTkzNzQyNn0.g7y2xwsw-h00i9ulzYva-Pp3jMf4JxVSrBtaFkRefPY" \
  "--build-arg=NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51TMYLdHBWrDCvu3c13zTfIJsPG0IPgfLbz8roEkEfVoHtxEVn7Rz93m2Zui05pWE1lMyKQfi1roHRuOzECeuFsNK00rHMX8ILk" \
  "--build-arg=NEXT_PUBLIC_APP_URL=https://login.laceynprice.com" \
  -t "laceynprice/lpbc-admin:${TAG}" \
  -t laceynprice/lpbc-admin:latest \
  . && \
docker push "laceynprice/lpbc-admin:${TAG}" && \
docker push laceynprice/lpbc-admin:latest

echo "Done — pushed laceynprice/lpbc-admin:${TAG}"
