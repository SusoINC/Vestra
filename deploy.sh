#!/usr/bin/env bash
# deploy.sh — despliega backend y/o frontend en VestraApp
# Uso: ./deploy.sh [backend|frontend|all]
set -euo pipefail

APP_HOST="root@192.168.1.112"
SSH_KEY="$HOME/.ssh/vestra_lxc"
SSH="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
APP_DIR="/opt/vestra"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

TARGET="${1:-all}"

deploy_backend() {
  echo "▶ Sincronizando backend..."
  rsync -az --delete \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    --exclude="__pycache__" \
    --exclude="*.pyc" \
    --exclude=".env" \
    --exclude="venv/" \
    "$REPO_ROOT/backend/" "$APP_HOST:$APP_DIR/backend/"

  $SSH "$APP_HOST" bash << 'REMOTE'
set -e
cd /opt/vestra/backend
export FLASK_APP=run.py FLASK_ENV=production
export $(grep -v '^#' /opt/vestra/backend/.env | xargs)

# Actualizar dependencias si requirements.txt cambió
/opt/vestra/venv/bin/pip install -r requirements.txt --quiet --prefer-binary

# Migraciones pendientes
/opt/vestra/venv/bin/flask db upgrade

chown -R vestra:vestra /opt/vestra/backend
systemctl restart vestra
sleep 2
systemctl is-active vestra && echo "✓ Backend activo"
REMOTE
}

deploy_frontend() {
  echo "▶ Sincronizando fuentes del frontend..."
  rsync -az --delete \
    -e "ssh -i $SSH_KEY -o StrictHostKeyChecking=no" \
    --exclude="node_modules/" \
    --exclude="dist/" \
    "$REPO_ROOT/frontend/" "$APP_HOST:$APP_DIR/frontend-src/"

  echo "▶ Build en servidor (Node 20)..."
  $SSH "$APP_HOST" bash << 'REMOTE'
set -e
cd /opt/vestra/frontend-src
npm install --silent
npm run build
rsync -a --delete dist/ /opt/vestra/frontend/
chown -R vestra:vestra /opt/vestra/frontend /opt/vestra/frontend-src
systemctl reload nginx
echo "✓ Frontend desplegado"
REMOTE
}

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)      deploy_backend; deploy_frontend ;;
  *)        echo "Uso: $0 [backend|frontend|all]"; exit 1 ;;
esac

echo "🚀 Deploy completado → http://192.168.1.112"
