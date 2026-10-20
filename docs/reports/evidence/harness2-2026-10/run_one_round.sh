#!/bin/zsh
cd /Users/rex/harness2
. .venv/bin/activate
set -a; . ./.env; set +a
export XDG_CONFIG_HOME=$HOME/harness2/xdg/config XDG_DATA_HOME=$HOME/harness2/xdg/data XDG_CACHE_HOME=$HOME/harness2/xdg/cache XDG_STATE_HOME=$HOME/harness2/xdg/state
export PATH="$HOME/harness2/bin:$HOME/harness2/dependencies/tools/node_modules/.bin:$PATH"
export HARNESS2_RUNS_DIR=$HOME/harness2/runs/jb8
harness2 --bench jb --k 1 --modes parallel --workers 1 --only-domains management_analysts --max-tasks 1 > runs/jb8_one_run.log 2>&1
echo "RUN_EXIT=$?" >> runs/jb8_one_run.log
harness2-judge --bench jb --k 1 --mode parallel > runs/jb8_one_judge.log 2>&1
echo "JUDGE_EXIT=$?" >> runs/jb8_one_judge.log
harness2-report --bench jb --k 1 --mode parallel > runs/jb8_one_report.log 2>&1
echo "REPORT_EXIT=$?" >> runs/jb8_one_report.log
