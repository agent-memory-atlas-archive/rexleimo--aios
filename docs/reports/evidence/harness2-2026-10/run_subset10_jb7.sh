#!/bin/zsh
cd /Users/rex/harness2
. .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb7
DOMAINS="management_analysts,biostatisticians,civil_engineers,technical_writers,computer_user_support_specialists,personal_financial_advisors,reporters_and_correspondents,statisticians,web_administrators,producers"
KEY=$(python3 -c "import json;print(json.load(open('$HOME/.config/opencode/opencode.json'))['provider']['novai']['options']['apiKey'])")
echo "[$(date +%H:%M)] bailian channel, starting sweep"
# ---- watchdog for stuck rollouts ----
(while true; do
  sleep 600
  ps -eo pid,etimes,command 2>/dev/null | grep "[b]un run --cwd /Users/rex/harness2/dependencies/opencode" | awk '$2+0 > 3000 {print $1}' | xargs kill -9 2>/dev/null
  pgrep -f "run_subset10_jb7.sh" >/dev/null || break
done) > runs/jb7_watchdog.log 2>&1 &
WD=$!
harness2 --bench jb --k 1 --modes parallel --workers 5 --only-domains $DOMAINS --max-tasks 1 > runs/jb7_run.log 2>&1
echo "RUN_EXIT=$?" >> runs/jb7_run.log
kill $WD 2>/dev/null
harness2-judge --bench jb --k 1 --mode parallel > runs/jb7_judge.log 2>&1
echo "JUDGE_EXIT=$?" >> runs/jb7_judge.log
harness2-report --bench jb --k 1 --mode parallel > runs/jb7_report.log 2>&1
echo "REPORT_EXIT=$?" >> runs/jb7_report.log
