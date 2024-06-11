
#!/bin/bash

# Find the PIDs of Node.js processes associated with main.js
PIDS=$(pgrep -f "main.js")

killall fbi
fbi -T 1 -d /dev/fb0 -noverbose /root/view-splash.png &

# If processes persist, forcefully terminate them
for PID in $PIDS; do
        echo "$PID"
        kill -s 9 "$PID"  # SIGKILL (forceful termination)
done



cd /home/view/current;
DATE=`date +"%Y%m%d-%H%M%S"`
UILOGFILE="/var/log/view-ui-$DATE.txt"
prepend_date() { while read line; do echo "$(date +%Y%m%d-%H%M%S) $line"; done }
echo "starting UI...";
forever -l forever.log -c "node --max_old_space_size=128" main.js 2>&1 | prepend_date >> $UILOGFILE &
