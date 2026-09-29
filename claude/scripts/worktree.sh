#!/usr/bin/env bash
# Page worktrees for the page pipeline (.claude/page-pipeline.md).
#   scripts/worktree.sh paths                print main checkout and worktrees folder
#   scripts/worktree.sh setup <page> [base]  page/<page> branch + <worktrees>/<page> worktree: create, or reuse and rebase onto base
#   scripts/worktree.sh serve                install deps, copy .env from the main checkout, dev server on a free port
#   scripts/worktree.sh stop                 stop the dev server started by serve
# Never prints .env contents. Needs setsid (Linux; macOS: brew install util-linux).
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
main_checkout="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"
worktrees="${PIPELINE_WORKTREES:-$(dirname "$main_checkout")/$(basename "$main_checkout")-pages}"
install_cmd="${PIPELINE_INSTALL:-npm ci --no-audit --no-fund}"
# The free port is appended as the last argument.
dev_cmd="${PIPELINE_DEV:-npm run dev -- --port}"
health_path="${PIPELINE_HEALTH_PATH:-/}"
state_dir="tmp/dev"

paths() {
  echo "MAIN_CHECKOUT=$main_checkout"
  echo "WORKTREES=$worktrees"
}

setup() {
  local page="${1:?usage: scripts/worktree.sh setup <page> [base]}"
  local base="${2:-$(git -C "$main_checkout" branch --show-current)}"
  local branch="page/$page"
  local worktree="$worktrees/$page"
  if ! git show-ref --verify --quiet "refs/heads/$branch"; then git branch "$branch" "$base"; fi
  if [ ! -d "$worktree" ]; then git worktree add "$worktree" "$branch" >&2; fi
  cd "$worktree"
  if [ -n "$(git status --porcelain)" ]; then
    echo "$worktree has uncommitted changes" >&2
    exit 1
  fi
  if ! git merge-base --is-ancestor "$base" HEAD; then
    if ! git rebase "$base" >&2; then
      git rebase --abort
      echo "$branch does not rebase cleanly onto $base" >&2
      exit 1
    fi
  fi
  echo "WORKTREE=$worktree"
  echo "BRANCH=$branch"
  echo "BASE=$base"
}

# Each worktree gets its own install: some dev servers (Next.js Turbopack) refuse node_modules symlinked outside the project root.
install_deps() {
  if [ ! -d node_modules ]; then $install_cmd; fi
}

copy_env() {
  if [ -f .env ] || [ "$PWD" = "$main_checkout" ] || [ ! -f "$main_checkout/.env" ]; then return; fi
  cp "$main_checkout/.env" .env
  echo ".env: copied from main checkout"
}

free_port() {
  node -e 'const s=require("net").createServer();s.listen(0,()=>{console.log(s.address().port);s.close()})'
}

serve() {
  if [ -f "$state_dir/pid" ] && kill -0 "$(cat "$state_dir/pid")" 2>/dev/null; then
    echo "BASE_URL=http://localhost:$(cat "$state_dir/port")"
    return
  fi
  install_deps
  copy_env
  mkdir -p "$state_dir"
  local port
  port="$(free_port)"
  # setsid: own process group, so stop kills the dev server's children too.
  setsid nohup $dev_cmd "$port" >"$state_dir/log" 2>&1 &
  echo $! >"$state_dir/pid"
  echo "$port" >"$state_dir/port"
  for _ in $(seq 1 180); do
    if curl -s -o /dev/null -w '%{http_code}' "http://localhost:$port$health_path" | grep -q '^200$'; then
      echo "BASE_URL=http://localhost:$port"
      return
    fi
    sleep 1
  done
  echo "Dev server did not answer on port $port in 180s; log: $state_dir/log" >&2
  stop
  exit 1
}

stop() {
  if [ -f "$state_dir/pid" ]; then
    kill -- "-$(cat "$state_dir/pid")" 2>/dev/null || true
    rm -f "$state_dir/pid" "$state_dir/port"
    echo "dev server stopped"
  fi
}

case "${1:-}" in
  paths) paths ;;
  setup) shift; setup "$@" ;;
  serve) serve ;;
  stop) stop ;;
  *)
    echo "Usage: scripts/worktree.sh paths|setup <page> [base]|serve|stop" >&2
    exit 2
    ;;
esac
