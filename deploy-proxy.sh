#/bin/sh

#DATE=`date`
#sed "s/{DATE}/$DATE/g" "./frontend/www/view.template" > ./frontend/www/view.manifest
rsync -r ./ root@view.tl:/var/www/tlpv2 --stats --exclude "node_modules"
#ssh root@45.55.94.97 'service view-proxy restart'
