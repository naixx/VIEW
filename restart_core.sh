
#!/bin/bash

# Find the PIDs of Node.js processes associated with main.js
PIDS=$(pgrep -f "intervalometer")

# If processes persist, forcefully terminate them
for PID in $PIDS; do
        echo "$PID"
        kill -s 9 "$PID"  # SIGKILL (forceful termination)
done


cd /home/view/current;
DATE=`date +"%Y%m%d-%H%M%S"`
CORELOGFILE="/var/log/view-core-$DATE.txt"
cat ./logs/current.txt > ./logs/previous.txt
> ./logs/last.txt
prepend_date() { while read line; do echo "$(date +%Y%m%d-%H%M%S) $line"; done }
echo "starting CORE...";
forever -c "node --max_old_space_size=320 --expose-gc" intervalometer/intervalometer-server.js 2>&1 | prepend_date | tee -a $CORELOGFILE ./logs/last.txt &
