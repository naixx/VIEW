var wget = require('wget-improved');
var https = require('https');
var fs = require('fs');
var url = require('url');
var child_process = require('child_process');
var spawn = child_process.spawn;
var exec = child_process.exec;

var apiHost = "api.github.com";
var apiEndpoint = "/repos/timelapseplus/VIEW/";
var baseInstallPath = "/home/view/";

var kernelVersion = "#51 PREEMPT Thu Jan 5 13:15:18 EST 2017";
var uBootVersion = "U-Boot SPL 2019.10-rc3TL+ VIEW-00141-g877294b-dirty (Sep 02 2019 - 16:49:04 +0000)";

var libgphoto2Version = "2.5.14.33";

var getLibGPhoto2Version = "/usr/local/bin/gphoto2 --version | grep \"libgphoto2 \"";
var installLibGPhoto2 = "/usr/bin/test -e /home/view/current/lib/libgphoto2_" + libgphoto2Version + "-1_armhf.deb && dpkg -i /home/view/current/lib/libgphoto2_" + libgphoto2Version + "-1_armhf.deb";

var getKernelVersion = "uname -v";
var doKernelUpdate = "/usr/bin/test -e /home/view/current/boot/zImage && /usr/bin/test -e /home/view/current/boot/sun5i-a13-timelapseplus-view.dtb && mount /dev/mmcblk0p1 /boot && cp /home/view/current/boot/zImage /boot/ && cp /home/view/current/boot/sun5i-a13-timelapseplus-view.dtb /boot/ && /bin/sync && umount /boot";

var updateWifiModprobe = "/usr/bin/test -e /home/view/current/lib/8723bu.conf && cp /home/view/current/lib/8723bu.conf /etc/modprobe.d/";

var getUBootVersion = "/bin/dd if=/dev/mmcblk0 bs=1024 count=32 | /usr/bin/strings | /bin/grep \"U-Boot SPL\"";
var doUBootUpdate = "/usr/bin/test -e /home/view/current/boot/u-boot-sunxi-with-spl.bin && /bin/dd if=/home/view/current/boot/u-boot-sunxi-with-spl.bin of=/dev/mmcblk0 bs=1024 seek=8";

var installIcons = "/usr/bin/test -e /home/view/current/fonts/icons.ttf && cp -u /home/view/current/fonts/icons.ttf /usr/share/fonts/truetype/";

function logDateHelper(logFileName) {
	var m = logFileName.match(/[a-z\/\-]+([0-9][0-9][0-9][0-9])([0-9][0-9])([0-9][0-9])-([0-2][0-9])([0-5][0-9])([0-5][0-9])\.txt/);
	if(m) {
		var year = parseInt(m[1]);
		var month = parseInt(m[2]) - 1;
		var day = parseInt(m[3]);
		var hour = parseInt(m[4]);
		var minute = parseInt(m[5]);
		var second = parseInt(m[6]);
		var date = new Date(year, month, day, hour, minute, second, 0);
		//console.log(date);
		return date;
	} else {
		return null;
		console.log("LOG CLEANUP: no match:", logFileName);
	}
}

function logPurgeHelper(logList, numberToKeep) {
	if(logList && logList.length > numberToKeep) {
		logList = logList.filter(function(l) { return logDateHelper(l);});
		if(logList && logList.length > numberToKeep) {
			logList.sort(function(a, b) {
				return logDateHelper(b) - logDateHelper(a);
			});
			for(var i = numberToKeep; i < logList.length; i++) {
				console.log("LOG CLEANUP: deleting", logList[i]);
				fs.unlink(logList[i]);
			}
		}
	}
}

function cleanupLogs() {
	exec('ls /var/log/view-*', function(err, res) {
		if(!err && res) {
			var logs = res.trim().split('\n');
			var uiLogs = logs.filter(function(l){return l.indexOf('ui')>0});
			var coreLogs = logs.filter(function(l){return l.indexOf('core')>0});
			logPurgeHelper(uiLogs, 2);
			logPurgeHelper(coreLogs, 10);
		}
	});
}

cleanupLogs(); // run on each start

function checkLibGPhotoUpdate(callback) {
	exec(getLibGPhoto2Version, function(err, stdout, stderr) {
		if(!err && stdout) {
			var parts = stdout.match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
			if(parts && parts.length > 1 ) {
				var version = parts[1].trim();
				exports.libgphoto2Version = version;
				if(version != libgphoto2Version) {
					console.log("libgphoto2 update required (current version = " + version + ")");
					callback(null, true);
				} else {
					console.log("libgphoto2 is up to date");
					callback(null, false);
				}
			} else {
				callback("error getting version");
			}
		} else {
			callback("error getting version");
		}
	});
}

function installLibGPhoto(callback) {
	exports.updatingLibGphoto = true;
	exec(installLibGPhoto2, function(err) {
		exports.updatingLibGphoto = false;
		checkLibGPhotoUpdate(function(err2, update) {
			callback(err);
		});
	});
}

function apiRequest(method, callback) {
	var req = https.request({method:'get', host:apiHost, path: apiEndpoint+method, headers: {'user-agent': 'VIEW-app'}}, function(res) {
		//console.log(`STATUS: ${res.statusCode}`);
		//console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
		res.setEncoding('utf8');
		var data = "";
		res.on('data', function(chunk) {
			data += chunk;
			//console.log(`BODY: ${chunk}`);
		});
		res.on('end', function() {
			var doc = JSON.parse(data);
			//console.log(doc);
			if(callback) callback(null, doc);
		});

	});
	req.end();
	req.on('error', function(err) {
		if(callback) callback(err);
	});
}

var dl = null;
function download(href, path, progressCallback, callback) {
    console.log("UPDATES: downloading " + href);
    var downloadSize = null;
	dl = wget.download(href, path, {headers: {'user-agent': 'VIEW-app'}});
	dl.on('error', function(err) {
	    console.log("UPDATES: download error: ", err);
		callback(err);
		dl = null;
	});
	dl.on('start', function(fileSize) {
	    downloadSize = fileSize;
	    console.log("UPDATES: downloading " + downloadSize + " bytes");
	});
	dl.on('end', function(output) {
	    console.log("UPDATES: download complete: ", output);
	    if(dl && dl.cancelled) {
			callback("cancelled");
	    } else {
			callback(null, path);
	    }
		dl = null;
	});
	dl.on('progress', function(bytesDownloaded) {
		progressCallback && progressCallback(bytesDownloaded, downloadSize);
	});
}

function cancelDownload(retry) {
	if(dl && dl.req && dl.req.abort) {
		dl.cancelled = true;
		dl.retry = retry;
		dl.req.abort();
	}
}


function extract(zipPath, destFolder, callback) {
	exec("test -e " + destFolder + '_zip_extract' + " && rm -rf " + destFolder + '_zip_extract', function(err){
		var unzip = spawn('unzip', ['-q', zipPath, '-d', destFolder + '_zip_extract']);
		console.log("extracting...");
		unzip.once('close', function(code) {
			fs.readdir(destFolder + '_zip_extract', function(err, files) {
				console.log(err, files);
				if(files && files.length > 0) {
					fs.rename(destFolder + '_zip_extract' + '/' + files[0], destFolder, function(){
						fs.rmdir(destFolder + '_zip_extract');
						console.log("done extracting");
						callback(err, destFolder);
					});
				} else {
					callback(err, destFolder);
				}
			});
		});
	});
}

function checkKernel(callback) {
	exec(getKernelVersion, function(err, stdout, stderr) {
		if(!err && stdout) {
			var currentKernel = stdout.trim();
			if(currentKernel == kernelVersion) {
				callback(null, false);
			} else {
				console.log("Current KERNEL:", currentKernel)
				callback(null, true);
			}
		} else {
			callback(err, false);
		}
	});
}

exports.updatingKernel = false;
function updateKernel(callback) {
	checkKernel(function(err1, needUpdate) {
		if(needUpdate) {
			console.log("KERNEL UPDATE REQUIRED");
			exports.updatingKernel = true;
			exec(doKernelUpdate, function(err, stdout, stderr) {
				exports.updatingKernel = false;
				if(err) {
					if(callback) callback(err);
					console.log("KERNEL UPDATE FAILED", err, stdout, stderr);
				} else {
					console.log("KERNEL UPDATE SUCCESS, running call back for reboot", err, stdout, stderr);
					if(callback) callback(false, true);
				}
			});
		} else {
			if(callback) callback(false);
			console.log("KERNEL UP TO DATE");
		}
	});
}

function checkUBoot(callback) {
	exec(getUBootVersion, function(err, stdout, stderr) {
		if(!err && stdout) {
			var currentUBoot = stdout.trim();
			if(currentUBoot == uBootVersion) {
				callback(null, false);
			} else {
				console.log("Current U-BOOT:", currentUBoot)
				callback(null, true);
			}
		} else {
			callback(err, false);
		}
	});
}

function updateUBoot(callback) {
	checkUBoot(function(err1, needUpdate) {
		if(needUpdate) {
			console.log("U-BOOT UPDATE REQUIRED");
			exec(doUBootUpdate, function(err, stdout, stderr) {
				if(err) {
					console.log("U-BOOT UPDATE FAILED", err, stdout, stderr);
				}
				if(callback) callback(err);
			});
		} else {
			if(callback) callback(false);
			console.log("U-BOOT UP TO DATE");
		}
	});
}

exports.version = "";
var installs = fs.readdirSync(baseInstallPath);
var current = "";
if(installs.indexOf('current') !== -1) {
	current = fs.readlinkSync(baseInstallPath + 'current');
	current = current.match(/[^\/]+$/)[0];
	console.log("current version:", current);
	exports.version = current;
}

var versionParse = function(item) {
	var numbers = item.split(/[\-.]/);
	if(numbers.length >= 3) {
		var n1 = 0, n2 = 0, n3 = 0, n4 = 0;
		n1 = parseInt(numbers[0].substr(1));
		n2 = parseInt(numbers[1]);
		bMatches = numbers[2].match(/(beta)?([0-9]+)/);
		if(bMatches[1]) {
			n3 = 0;
			if(bMatches[2]) {
				n4 = parseInt(bMatches[2]);
			}
		} else {
			n3 = parseInt(bMatches[2]);
			if(numbers[3]) {
				bMatches = numbers[3].match(/(beta)?([0-9]+)/);
				if(bMatches && bMatches[1]) {
					if(bMatches[2]) {
						n4 = parseInt(bMatches[2]);
					} else {
						n4 = 0;
					}
				} else {
					n4 = 0;
				}
			} else {
				n4 = 0;
			}
		}
		//console.log("item = ", n1, n2, n3, n4);
		return [n1, n2, n3, n4]; 
	} else {
		return null;
	}
}

var sortInstalls = function(list, reverse){
	return list.sort(function(a, b) {
		var a = versionParse(a);
		var b = versionParse(b);
		if(a && b) {
			for(var i = 0; i < 4; i++) {
				if(a[i] > b[i]) return reverse ? -1 : 1;
				if(a[i] < b[i]) return reverse ? 1 : -1;
			}
			return 0;
		} else {
			if(a && !b) return reverse ? -1 : 1;
			if(!a && b) return reverse ? 1 : -1;
			return 0;
		}
	});
}

exports.cleanup = function() {
	try {
		var maxKeep = 6;
		var maxBeta = Math.floor(maxKeep / 2);

		var list = fs.readdirSync(baseInstallPath);
		var installs = list.filter(function(item){return item.match(/^v[0-9]+\.[0-9]+/)});

		if(installs.length > maxKeep) {
			var betaInstalls = sortInstalls(installs.filter(function(item){return item.match(/beta/)}), true).slice(0, maxBeta - 1);
			var stableInstalls = sortInstalls(installs.filter(function(item){return item.match(/^(?:(?!beta).)+$/)}), true).slice(0, maxKeep - 1);

			var keepInstalls = sortInstalls(stableInstalls.concat(betaInstalls), true).slice(0, maxKeep - 1);

			var deleteInstalls = installs.filter(function(item){
				return keepInstalls.indexOf(item) === -1 && item != current;
			});

			if(deleteInstalls.length > 0) {
				for(var i = 0; i < deleteInstalls.length; i++) {
					if(deleteInstalls[i].length > 5) {
						var deleteCommand = "rm -rf " + baseInstallPath + deleteInstalls[i];
						console.log("UPDATES: cleaning up: ", deleteCommand);
						exec(deleteCommand);
					}
				}
			}
		}
	} catch(e) {
		console.log("UPDATES: error while cleaning up", e);
	}
}

exports.getCurrentVersion = function() {
	return current;	
}

exports.developerMode = false;
var cachedVersions = null;
exports.clearCache = function() {
	cachedVersions = null;
}


exports.getVersions = function(callback){
	if(cachedVersions) {
		callback(null, cachedVersions);
	} else {
		apiRequest('releases', function(err, res) {
			if(!err && res) {
				var installs = fs.readdirSync(baseInstallPath);
				var current = "";
				console.log(installs);
				if(installs.indexOf('current') !== -1) {
					current = fs.readlinkSync(baseInstallPath + 'current');
					current = current.match(/[^\/]+$/)[0];
					console.log("current version:", current);
				}
				var list = [];
				for(var i = 0; i < res.length; i++) {
					if(!res[i].prerelease || exports.developerMode) list.push({
						version: res[i].tag_name,
						description: res[i].name,
						notes: res[i].body,
						url: res[i].zipball_url,
						pre: res[i].prerelease,
						date: res[i].published_at,
						installed: installs.indexOf(res[i].tag_name) !== -1,
						current: res[i].tag_name == current
					});
				}
				cachedVersions = list;
				setTimeout(exports.clearCache, 1000*60*5);
				callback(null, list);
			} else {
				callback(err);
			}
		});		
	}
};

exports.getInstalledVersions = function(callback){
	var installs = fs.readdirSync(baseInstallPath);
	var current = "";
	console.log(installs);
	if(installs.indexOf('current') !== -1) {
		current = fs.readlinkSync(baseInstallPath + 'current');
		current = current.match(/[^\/]+$/)[0];
		console.log("current version:", current);
	}
	var list = [];
	installs = installs.filter(function(item) {
		return item.match(/^v[0-9]+\.[0-9]+/);
	});
	installs = sortInstalls(installs, true);

	for(var i = 0; i < installs.length; i++) {
		var beta = installs[i].match(/beta/) ? true : false;
		list.push({
			version: installs[i],
			description: installs[i],
			notes: installs[i] + " (notes not available offline)",
			url: null,
			pre: beta,
			date: null,
			installed: true,
			current: installs[i] == current
		});
	}
	callback(null, list);
};

exports.installing = false;
exports.installStatus = null;
var statusTimer = null;
exports.installVersion = function(versionInfo, callback, statusCallback) {
	exports.installing = true;
	var updateStatus = function(status, percent) {
		console.log("INSTALL:", status);
		exports.installStatus = status;
		if(statusCallback) statusCallback(status, percent || null);
		if(statusTimer) clearTimeout(statusTimer);
		statusTimer = setTimeout(function(){
			statusTimer = null;
			if(!exports.installing) exports.installStatus = null;
		}, 5000);
	}
	if(versionInfo.version && versionInfo.url) {
		updateStatus('downloading...');
	    var downloadSize = 80 * 1024 * 1024; // 80MB
	    var lastPercentage = null;
		var downloadTimer = null;
		var setDownloadWatchDog = function() {
			if(downloadTimer) clearTimeout(downloadTimer);
			downloadTimer = setTimeout(function() {
				downloadTimer = null;
				cancelDownload(true);
			}, 30000);
		}
		setDownloadWatchDog();
		download(versionInfo.url, baseInstallPath + "tmp.zip", function(bytesDownloaded, totalSize){
			if(totalSize && totalSize > 0) downloadSize = totalSize;
			setDownloadWatchDog();
			var percentage = Math.round((bytesDownloaded/downloadSize)*100);
			if(percentage != lastPercentage) {
				console.log("UPDATES: download progress:", percentage);
				updateStatus('downloading...', percentage/100);
				lastPercentage = percentage;
			}
		},function(err, info){
			if(downloadTimer) clearTimeout(downloadTimer);
			downloadTimer = null;
			if(err) {
				exports.installing = false;
				if(dl && dl.retry) {
					updateStatus('retrying download...', 0.0);
					return exports.installVersion(versionInfo, callback, statusCallback);
				} else if(dl && dl.cancelled) {
					updateStatus('download cancelled');
				} else {
					updateStatus('download failed.');
				}
				callback(err);
			} else {
				updateStatus('extracting...', 0.0);
				var extractComplete = 0;
				var extractSeconds = 230;
				var extractInterval = setInterval(function(){
					extractComplete += 2;
					if(extractComplete > extractSeconds) extractComplete = extractSeconds;
					updateStatus('extracting...', extractComplete / extractSeconds);
				}, 2000);

				extract(baseInstallPath + "tmp.zip", baseInstallPath + versionInfo.version, function(err) {
					clearInterval(extractInterval);
					if(err) {
						updateStatus('extract failed.');
						exports.installing = false;
						callback(err);
					} else {
						fs.unlink(baseInstallPath + "tmp.zip");
						fs.writeFile(baseInstallPath + versionInfo.version + "/version.json", JSON.stringify(versionInfo), function(){
							updateStatus('done.');
							exports.installing = false;
							callback();
						});
					}
				});
			}
		});
	} else {
		callback("invalid version object");
	}
}

exports.setVersion = function(versionInfo, callback) {
	var installs = fs.readdirSync(baseInstallPath);
	console.log(installs);
	if(installs.indexOf('current') !== -1) {
		fs.unlinkSync(baseInstallPath + 'current');
	}
	fs.symlink(baseInstallPath + versionInfo.version, baseInstallPath + 'current', function(err) {
		callback && callback(err);
		console.log(err);
	});
} 

exports.installIcons = function(callback) {
	exec(installIcons, callback);
}

exports.installFromPath = function(versionInfo, callback, statusCallback) {
	var updateStatus = function(status, percent) {
		if(statusCallback) statusCallback(status, percent || null);
	}
	var extractComplete = 0;
	var extractSeconds = 230;
	var extractInterval = setInterval(function(){
		extractComplete += 2;
		if(extractComplete > extractSeconds) extractComplete = extractSeconds;
		updateStatus('extracting...', extractComplete / extractSeconds);
	}, 2000);
	extract(versionInfo.zipPath, baseInstallPath + versionInfo.version, function(err, destFolder) {
		clearInterval(extractInterval);
		if(err) {
			callback && callback(true);
		} else {
			fs.writeFile(baseInstallPath + versionInfo.version + "/version.json", JSON.stringify({version: versionInfo.version}), function(){
				exports.setVersion(versionInfo, function(err){
					console.log("installation complete!");
					callback && callback();
				});
			});
		}
	});
}

exports.getValidVersionFromSdCard = function(callback) {
	fs.readdir("/media/", function(err, sdContents) {
		console.log('sdContents', sdContents);
		if(!err && sdContents) {
			var versions = sdContents.filter(function(item){
				return item.match(/^VIEW-[0-9]+\.[0-9]+(-beta)?[0-9.]*(-beta)?\.zip$/);
			});
			console.log('versions', versions);
			if(versions.length > 0) {
				versions = versions.map(function(item){
					return item.replace('VIEW-', 'v');
				});
				versions = sortInstalls(versions, true);
				var result = {
					version: versions[0].replace('.zip', '').trim(),
					zipPath: '/media/' + versions[0].replace('v', 'VIEW-')
				}
				callback && callback(null, result);
			} else {
				callback && callback("no valid firmware found on SD card");
			}
		} else {
			callback && callback("unable to read SD card");
		}
	});
}


exports.download = download;
exports.cancel = cancelDownload;
exports.extract = extract;
exports.apiRequest = apiRequest;

exports.checkLibGPhotoUpdate = checkLibGPhotoUpdate;
exports.installLibGPhoto = installLibGPhoto;

exports.updateKernel = updateKernel;
exports.updateUBoot = updateUBoot;

