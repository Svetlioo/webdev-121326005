#!/bin/sh
# The laptop's model for the live site: Ollama plus the worker, connected to the live database (.env.live).
#   npm run live:start   starts Ollama (if it is not running) and the worker in the background
#   npm run live:stop    stops the worker and Ollama (no more fans)
#   npm run live:status  shows what is running
cd "$(dirname "$0")/.." || exit 1
PID=.live-worker.pid
LOG=.live-worker.log

running() { [ -f "$PID" ] && kill -0 "$(cat "$PID")" 2>/dev/null; }
# The worker's own lines, without pg's SSL warning.
last() { grep -E "worker|import|plan|model|Error|error" "$LOG" | tail -n "$1"; }

case "$1" in
  start)
    [ -f .env.live ] || { echo "Missing .env.live with the live DATABASE_URL"; exit 1; }
    if running; then echo "The worker is already running (pid $(cat "$PID"))."; exit 0; fi
    if ! pgrep -x ollama >/dev/null; then
      echo "Starting Ollama…"
      nohup ollama serve >/dev/null 2>&1 &
      sleep 2
    fi
    # .env.live comes last, so its DATABASE_URL wins over the local one in .env.
    nohup npx tsx --env-file-if-exists=.env --env-file=.env.live src/worker/index.ts >"$LOG" 2>&1 &
    echo $! >"$PID"
    sleep 4
    if running; then echo "Worker started for the live site (pid $(cat "$PID")). Log: $LOG"; last 2
    else echo "The worker did not start:"; tail -n 20 "$LOG"; rm -f "$PID"; exit 1; fi
    ;;
  stop)
    if running; then pkill -P "$(cat "$PID")" 2>/dev/null; kill "$(cat "$PID")" 2>/dev/null; echo "Worker stopped."; else echo "The worker was not running."; fi
    rm -f "$PID"
    pkill -f "src/worker/index.ts" 2>/dev/null
    if pgrep -x ollama >/dev/null; then pkill -x ollama; echo "Ollama stopped."; fi
    ;;
  status)
    if running; then echo "Worker: running (pid $(cat "$PID"))"; last 3; else echo "Worker: stopped"; fi
    if pgrep -x ollama >/dev/null; then echo "Ollama: running"; else echo "Ollama: stopped"; fi
    ;;
  *) echo "Usage: npm run live:start | live:stop | live:status"; exit 1 ;;
esac
