#!/usr/bin/env bash
# Build and deploy crma-frontend to Cloud Run.
#
# Usage:
#   cp _build_fe.env.example _build_fe.env   # first time only
#   bash _build_fe.sh
#
# All configuration is read from _build_fe.env (gitignored).
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/_build_fe.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "  cp _build_fe.env.example _build_fe.env"
  echo "  # then fill in your values"
  exit 1
fi

# Load config
# shellcheck source=_build_fe.env
source "$ENV_FILE"

# Validate required vars
for var in PROJECT API_URL FE_SA FE_KEY ARCO_IBF FE_DEVOPS BUILD_DIR; do
  if [ -z "${!var}" ]; then
    echo "ERROR: $var is not set in $ENV_FILE"
    exit 1
  fi
done

echo "=== Preparing build context ==="
rm -rf "$BUILD_DIR"
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='__pycache__' --exclude='*.txt' --exclude='*.py' \
  "$ARCO_IBF/" "$BUILD_DIR/"
cp "$FE_DEVOPS/Dockerfile" "$BUILD_DIR/"
cp "$FE_DEVOPS/cloudbuild.yaml" "$BUILD_DIR/"
# Patch next.config.js with output: 'standalone' (required by Dockerfile, not committed to source)
sed -i "s/module.exports = {/module.exports = {\n  output: 'standalone',/" "$BUILD_DIR/next.config.js"
echo "Build context ready: $BUILD_DIR"

echo "=== Activating FE deployer SA ==="
gcloud auth activate-service-account --key-file="$FE_KEY"

echo "=== Submitting Cloud Build ==="
cd "$BUILD_DIR"
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project="$PROJECT" \
  --service-account="$FE_SA" \
  --substitutions="_API_URL=$API_URL"
