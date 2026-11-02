#!/usr/bin/env bash
# ==============================================================================
# Quiz (TUAF Edition) — Zero-Touch Auto-Provision & Production Deploy Script
# Tự động:
#   1. Cài đặt Git hook (post-merge) để mỗi lần `git pull` tự động chạy script
#   2. Khởi tạo / cập nhật file `.env` (giữ nguyên các giá trị hiện có)
#   3. Tự động tạo user `quiz_user`, database `quiz_db` & cấp quyền trên `tuaf-supabase-db`
#   4. Tự động pull Docker image `ghcr.io/xuanhoatrieu/quiz:latest` & khởi động `quiz-web`
#   5. Kiểm tra `/health` trên cổng 3600 (Cloudflare Tunnel: http://10.64.11.109:3600)
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

ENV_FILE="$ROOT_DIR/.env"
COMPOSE_FILE="$ROOT_DIR/compose.prod.yml"
PG_CONTAINER="${PG_CONTAINER:-tuaf-supabase-db}"

echo -e "${BLUE}==================================================================${NC}"
echo -e "${GREEN}🚀 QUIZ (TUAF) — AUTO SETUP & PRODUCTION DEPLOY${NC}"
echo -e "${BLUE}==================================================================${NC}"

# ─── 1. Cài đặt Git Hook `post-merge` để tự động chạy khi `git pull` ─────────
if [ -d "$ROOT_DIR/.git" ]; then
  HOOK_FILE="$ROOT_DIR/.git/hooks/post-merge"
  cat > "$HOOK_FILE" <<'EOF'
#!/usr/bin/env bash
set -e
REPO_ROOT="$(git rev-parse --show-toplevel)"
if [ -f "$REPO_ROOT/deploy.sh" ]; then
  echo "🔄 [post-merge] Phát hiện git pull mới — đang tự động cập nhật DB, .env & Docker container..."
  bash "$REPO_ROOT/deploy.sh" --from-hook
fi
EOF
  chmod +x "$HOOK_FILE"
  echo -e "${GREEN}✓ Đã kích hoạt Git hook (.git/hooks/post-merge): mỗi lần 'git pull' sẽ tự động cập nhật toàn bộ.${NC}"
fi

# ─── 2. Khởi tạo hoặc cập nhật bổ sung file `.env` ───────────────────────────
ensure_env_key() {
  local key="$1"
  local default_val="$2"
  if ! grep -qE "^${key}=" "$ENV_FILE" 2>/dev/null; then
    echo "${key}=${default_val}" >> "$ENV_FILE"
    echo -e "${YELLOW}  + Đã thêm biến mới vào .env: ${key}${NC}"
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo -e "${YELLOW}⚙️  Chưa có file .env — đang tự động khởi tạo .env chuẩn Production...${NC}"
  RAND_DB_PASS="QuizTuaf_$(openssl rand -hex 12 2>/dev/null || head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  RAND_ADMIN_PASS="${MANAGER_PASSWORD:-TuafQuiz@2026}"

  cat > "$ENV_FILE" <<EOF
# ==============================================================================
# QUIZ (TUAF EDITION) — PRODUCTION ENVIRONMENT (.env)
# Tự động sinh bởi deploy.sh ($(date -Iseconds))
# ==============================================================================

# 1. Cổng dịch vụ trên host 10.64.11.109 (Cloudflare Tunnel -> http://10.64.11.109:3600)
QUIZ_PORT=3600
WEB_ORIGIN=https://quiz.hoclieu.id.vn
WS_PORT=3001
PATH_CONFIG=/app/config

# 2. Kết nối PostgreSQL dùng chung (tuaf-supabase-db qua mạng tuaf-ai-network)
DATABASE_URL=postgresql://quiz_user:${RAND_DB_PASS}@tuaf-supabase-db:5432/quiz_db

# 3. Tài khoản Super Admin & Mã mời Giảng viên (RBAC)
MANAGER_USERNAME=admin
MANAGER_PASSWORD=${RAND_ADMIN_PASS}
TEACHER_INVITE_CODE=TUAF2026

# 4. Cấu hình AI tạo câu hỏi tự động (OpenAI-compatible endpoint)
AI_BASE_URL=http://152.67.112.145:8317/v1
AI_API_KEY=${AI_API_KEY:-}
AI_MODEL=gemini-3-flash-preview
EOF
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}✓ Đã tạo mới file .env thành công!${NC}"
else
  echo -e "${CYAN}ℹ️  File .env đã tồn tại — đang kiểm tra & đồng bộ các biến cấu hình còn thiếu...${NC}"
  ensure_env_key "QUIZ_PORT" "3600"
  ensure_env_key "WEB_ORIGIN" "https://quiz.hoclieu.id.vn"
  ensure_env_key "WS_PORT" "3001"
  ensure_env_key "PATH_CONFIG" "/app/config"
  ensure_env_key "DATABASE_URL" "postgresql://quiz_user:QuizTuaf_StrongPassword_2026@tuaf-supabase-db:5432/quiz_db"
  ensure_env_key "MANAGER_USERNAME" "admin"
  ensure_env_key "MANAGER_PASSWORD" "TuafQuiz@2026"
  ensure_env_key "TEACHER_INVITE_CODE" "TUAF2026"
  ensure_env_key "AI_BASE_URL" "http://152.67.112.145:8317/v1"
  ensure_env_key "AI_API_KEY" "${AI_API_KEY:-}"
  ensure_env_key "AI_MODEL" "gemini-3-flash-preview"
  chmod 600 "$ENV_FILE"
  echo -e "${GREEN}✓ File .env đã đầy đủ và đồng bộ.${NC}"
fi

# Đọc biến từ .env
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ─── 3. Tự động tạo PostgreSQL User (`quiz_user`) & Database (`quiz_db`) ─────
if [ -n "${DATABASE_URL:-}" ]; then
  # Tách thông tin user, password, db_name từ DATABASE_URL
  DB_CRED_PART="${DATABASE_URL#*://}"
  DB_CRED_PART="${DB_CRED_PART%%@*}"
  DB_USER="${DB_CRED_PART%%:*}"
  DB_PASS="${DB_CRED_PART#*:}"
  DB_PATH_PART="${DATABASE_URL#*@}"
  DB_NAME="${DB_PATH_PART#*/}"
  DB_NAME="${DB_NAME%%\?*}"

  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    echo -e "${YELLOW}🗄️  Đang tự động khởi tạo/đồng bộ User '${DB_USER}' và Database '${DB_NAME}' trên '${PG_CONTAINER}'...${NC}"

    # 3.1 Tạo hoặc đồng bộ mật khẩu user
    docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres <<EOSQL >/dev/null
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER "${DB_USER}" WITH PASSWORD '${DB_PASS}';
  ELSE
    ALTER USER "${DB_USER}" WITH PASSWORD '${DB_PASS}';
  END IF;
END
\$\$;
EOSQL

    # 3.2 Tạo database nếu chưa tồn tại (chuẩn tuaf-supabase-db)
    DB_EXISTS=$(docker exec -i "$PG_CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | tr -d '[:space:]')
    if [ "$DB_EXISTS" != "1" ]; then
      docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -c "CREATE DATABASE \"${DB_NAME}\";" >/dev/null
      echo -e "${GREEN}  + Đã tạo mới database '${DB_NAME}'.${NC}"
    fi

    # 3.3 Cấp toàn quyền trên database và schema public
    docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE \"${DB_NAME}\" TO \"${DB_USER}\";" >/dev/null
    docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d "${DB_NAME}" -c "GRANT ALL ON SCHEMA public TO \"${DB_USER}\"; GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"${DB_USER}\"; ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO \"${DB_USER}\";" >/dev/null

    echo -e "${GREEN}✓ Database '${DB_NAME}' & User '${DB_USER}' đã sẵn sàng 100%!${NC}"
  else
    echo -e "${YELLOW}⚠️  Không tìm thấy container '${PG_CONTAINER}' trên host này — bỏ qua bước docker exec tạo DB (ứng dụng sẽ tự khởi tạo bảng khi kết nối).${NC}"
  fi
fi

# ─── 4. Đảm bảo Docker Network & Đồng bộ docker-compose.yml ──────────────────
if ! docker network inspect tuaf-ai-network >/dev/null 2>&1; then
  echo -e "${YELLOW}🌐 Đang tạo Docker network 'tuaf-ai-network'...${NC}"
  docker network create tuaf-ai-network >/dev/null
fi

if [ -f "$COMPOSE_FILE" ]; then
  cp -f "$COMPOSE_FILE" "$ROOT_DIR/docker-compose.yml"
fi

# ─── 5. Pull Image từ GHCR & Khởi động Container ─────────────────────────────
if [ "${SKIP_DOCKER_UP:-0}" != "1" ]; then
  echo -e "${YELLOW}🐳 Đang pull image mới nhất (ghcr.io/xuanhoatrieu/quiz:latest) và khởi động quiz-web...${NC}"
  docker compose -f "$COMPOSE_FILE" pull
  docker compose -f "$COMPOSE_FILE" up -d

  TARGET_PORT="${QUIZ_PORT:-3600}"
  echo -e "${YELLOW}⏳ Đang kiểm tra healthcheck tại http://127.0.0.1:${TARGET_PORT}/health ...${NC}"
  HEALTH_OK=0
  for _ in $(seq 1 20); do
    if curl -fsS "http://127.0.0.1:${TARGET_PORT}/health" >/dev/null 2>&1; then
      HEALTH_OK=1
      break
    fi
    sleep 1
  done

  if [ "$HEALTH_OK" = "1" ]; then
    HEALTH_JSON=$(curl -fsS "http://127.0.0.1:${TARGET_PORT}/health" || true)
    echo -e "${GREEN}✅ QUIZ ĐÃ CHẠY THÀNH CÔNG TRÊN CỔNG ${TARGET_PORT}! Health: ${HEALTH_JSON}${NC}"
  else
    echo -e "${YELLOW}⚠️  Container đang khởi động, kiểm tra log bằng: docker logs quiz-web --tail 50${NC}"
  fi
fi

echo -e "${BLUE}==================================================================${NC}"
echo -e "${GREEN}🎉 HOÀN TẤT TỰ ĐỘNG HÓA!${NC}"
echo -e "  • Local / Tunnel Origin : ${CYAN}http://10.64.11.109:${QUIZ_PORT:-3600}${NC}"
echo -e "  • Public Domain         : ${CYAN}${WEB_ORIGIN:-https://quiz.hoclieu.id.vn}${NC}"
echo -e "  • Super Admin           : ${CYAN}${MANAGER_USERNAME:-admin}${NC}"
echo -e "  • Mã mời Giảng viên     : ${CYAN}${TEACHER_INVITE_CODE:-TUAF2026}${NC}"
echo -e "${BLUE}==================================================================${NC}"
