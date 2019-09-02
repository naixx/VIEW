var EventEmitter = require("events").EventEmitter;
var exec = require('child_process').exec;
var SerialPort = require('serialport');
var _ = require('underscore');
var GPS = require('gps');
var moment = require('moment');
require('rootpath')();
var power = require('hardware/power.js');
var gps = new GPS;
var MCU_VERSION = 10;


var mcu = new EventEmitter();

mcu.ready = null;
mcu.gpsAvailable = null;
mcu.gps = gps.state;
mcu.lastGpsFix = null;
mcu.knob = 0;
mcu.customLatitude = null;
mcu.customLongitude = null;
mcu.disableGpsTimeUpdate = false;

mcu.timezone = "GMT+00:00";

mcu.init = function(callback) {
	_connectSerial('/dev/ttyS1', function(err, version) {
		if(!err && version) {
			mcu.ready = true;
			callback && callback(null, version);
		} else {
			mcu.ready = false;
			callback && callback(err);
		}
	});
}

mcu.timezoneOffset = function() {
	var matches = mcu.timezone.match(/GMT([+-][0-9]+):([0-9]+)/);
	if(matches && matches.length > 1) {
		return parseInt(matches[1]) * 60 + parseInt(matches[2]);
	}
	return 0;
}

mcu.now = function() {
	var now = moment();
	now.utcOffset(mcu.timezoneOffset());
	return now;
}

mcu.setDate = function(date) {
	var date = moment(date).utc();
	var time = moment().utc();
	console.log("MCU: setting date to ", date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss"), " UTC");
    exec('date -u -s "' + date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss") + '"');
}

mcu.setTime = function(time) {
	var time = moment(time).utc();
	var date = moment().utc();
	console.log("MCU: setting time to ", date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss"), " UTC");
    exec('date -u -s "' + date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss") + '"');
}

mcu.setDateTime = function(time) {
	var time = moment(time).utc();
	var date = moment(time).utc();
	console.log("MCU: setting date & time to ", date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss"), " UTC");
    exec('date -u -s "' + date.format("YYYY-MM-DD") + ' ' + time.format("HH:mm:ss") + '"');
}

mcu.validCoordinates = function() {
	var lat = null;
	var lon = null;
	var alt = null;
	var src = null;
	if(gps.state.fix && gps.state.lat !== null && gps.state.lon !== null) {
		lat = gps.state.lat;
		lon = gps.state.lon;
		alt = gps.state.alt || 0;
		src = 'gps';
	} else if((power.gpsEnabled == 'disabled' || !mcu.gpsAvailable) && (mcu.lastGpsFix && !mcu.lastGpsFix.fromDb && mcu.lastGpsFix.lat !== null && mcu.lastGpsFix.lon !== null)) {
		lat = mcu.lastGpsFix.lat;
		lon = mcu.lastGpsFix.lon;
		alt = mcu.lastGpsFix.alt || 0;
		src = 'cache';
	} else if((power.gpsEnabled == 'disabled' || !mcu.gpsAvailable) && mcu.customLatitude !== null && mcu.customLongitude != null) {
		lat = mcu.customLatitude;
		lon = mcu.customLongitude;
		alt = 0;
		src = 'manual';
	}
	if(lat !== null && lon != null) {
		return {
			lat: lat,
			lon: lon,
			alt: alt,
			src: src
		}
	} else {
		return null;
	}
}

function _getVersion(callback) {
	_send('V', function(err) {
		setTimeout(function() {
			callback && callback(err, mcu.version);
		}, 1000);
	});
}

function _programMcu(callback) {
	console.log("progamming MCU...");
	exec("test -e /lib/arm-linux-gnueabihf/libusb--disabled--0.1.so.4 && mv /lib/arm-linux-gnueabihf/libusb--disabled--0.1.so.4 /lib/arm-linux-gnueabihf/libusb-0.1.so.4; /usr/bin/test -e /home/view/current/firmware/mcu.hex && /usr/local/bin/avrdude -C /etc/avrdude.conf -P gpio -c gpio0 -p t841 -U lfuse:w:0xc2:m && /usr/local/bin/avrdude -C /etc/avrdude.conf -P gpio -c gpio0 -p t841 -e && /usr/local/bin/avrdude -C /etc/avrdude.conf -P gpio -c gpio0 -p t841 -U flash:w:/home/view/current/firmware/mcu.hex:i; test -e /lib/arm-linux-gnueabihf/libusb-0.1.so.4 && mv /lib/arm-linux-gnueabihf/libusb-0.1.so.4 /lib/arm-linux-gnueabihf/libusb--disabled--0.1.so.4", function(err) {
		if(err) {
			console.log("MCU programming failed");
		} else {
			console.log("MCU programming successfull");
		}
		callback && callback(err);
	});
}

var gpsFix = null;
function _parseData(data) {
	try {
		data = data.toString();
		if(data.substr(0, 1) == 'V') {
			var version = parseInt(data.substr(1, 2));
			mcu.version = version;
			console.log("MCU firmware version: " + mcu.version);
			setTimeout(function(){
				if(mcu.gpsAvailable === null) {
					mcu.gpsAvailable = false;
					mcu.emit('gps', 0);
				}
			}, 2000);
		} else if(data.substr(0, 1) == '$') {
			gps.update(data);
			if(gps.state.fix && gps.state.lat !== null && gps.state.lon !== null) {
				mcu.lastGpsFix = _.clone(gps.state);
				if(!gpsFix && !mcu.disableGpsTimeUpdate) {
					mcu.setDateTime(mcu.lastGpsFix.time);
				}
			}
			if(!mcu.gpsAvailable) {
				mcu.gpsAvailable = true;
				mcu.emit('gps', 1);
			}
			if(gps.state.fix != gpsFix) {
				mcu.emit('gps', gps.state.fix ? 2 : 1);
				gpsFix = gps.state.fix;
			}
		} else if(data.substr(0, 1) == 'K') {
			var knob = parseInt(data.substr(2, 1));
			if(data.substr(1, 1) == '-') knob = 0 - knob;
			mcu.knob += knob;
			mcu.emit('knob', knob);
			//console.log(mcu.knob);
		}
	} catch(e) {
		console.log("Error while parsing MCU data", e, data);
	}
}

var _send = function(data, callback) {
	callback && callback("not connected");
}

function _connectSerial(path, callback) {
    var port = new SerialPort(path, {
        baudrate: 38400,
        parser: SerialPort.parsers.readline('\r\n')
    }, function() {
        console.log('MCU Serial Opened');
        
        port.on('data', function(data) {
        	//console.log("MCU Data: ", data);
        	_parseData(data);
        });

        _send = function(data, cb) { 
        	port.write(data, function(err) {
	            port.drain(function() {
	                cb && cb(err);
	            });
	        });
        }

        _getVersion(function(err, version) {
        	if(version != MCU_VERSION) {
        		_programMcu(function(err) {
			        _getVersion(function(err, version) {
			        	if(err || version != MCU_VERSION) {
			        		console.log("failed to activate MCU!");
			        		callback && callback("unable to connect to MCU");
			        	} else {
			        		callback && callback(err, version);
			        	}
			        });
        		});
        	} else {
        		callback && callback(err, version);
        	}
        });
    });
}

module.exports = mcu;

