var EventEmitter = require("events").EventEmitter;
var exec = require('child_process').exec;
require('rootpath')();
var camera = require('camera/camera.js');
var db = require('system/db.js');
var motion = require('motion/motion.js');
var image = require('camera/image/image.js');
var exp = require('intervalometer/exposure.js');
var interpolate = require('intervalometer/interpolate.js');
var fs = require('fs');
var async = require('async');
var TLROOT = "/root/time-lapse";
var Button = require('gpio-button');
var gpio = require('linux-gpio');
var aux2out = require('node-aux2out');
var _ = require('underscore');
//var suncalc = require('suncalc');
var meeus = require('meeusjs');
var eclipse = require('intervalometer/eclipse.js');
var moment = require('moment');

var AUXTIP_OUT = 111;
var AUXRING_OUT = 110;
var HOTSHOE_IN = 34;

function remap(method) { // remaps camera.ptp methods to use new driver if possible
    switch(method) {
        case 'camera.setEv':
            if(camera.ptp.new.available) {
                return camera.ptp.new.setEv;
            } else {
                return camera.setEv;
            }
        case 'camera.setExposure':
            if(camera.ptp.new.available) {
                return camera.ptp.new.setExposure;
            } else {
                return camera.setExposure;
            }
        case 'camera.ptp.settings.format':
            if(camera.ptp.new.available) {
                return camera.ptp.new.cameras[0].camera.config.format && camera.ptp.new.cameras[0].camera.config.format.value && camera.ptp.new.cameras[0].camera.config.format.value.toUpperCase();
            } else {
                return camera.ptp.settings.format;
            }
        case 'camera.ptp.model':
            if(camera.ptp.new.available) {
                return camera.ptp.new.model;
            } else {
                return camera.ptp.model;
            }
        case 'camera.ptp.supports.destination':
            if(camera.ptp.new.available) {
                return camera.ptp.new.supports.destination;
            } else {
                return camera.ptp.supports.destination;
            }
        case 'camera.ptp.connected':
            if(camera.ptp.new.available) {
                return camera.ptp.new.available;
            } else {
                return camera.ptp.connected;
            }
        case 'camera.ptp.getSettings':
            if(camera.ptp.new.available) {
                return function(callback) {callback && callback()};
            } else {
                return camera.ptp.getSettings;
            }
        case 'camera.ptp.capture':
            if(camera.ptp.new.available) {
                return function(captureOptions, callback) {
                    var options = {
                        destination: (intervalometer.currentProgram.destination == 'sd' && camera.ptp.sdPresent && camera.ptp.sdMounted) ? 'sd' : 'camera',
                    }
                    if(captureOptions && captureOptions.mode == 'test') {
                        options.destination = "VIEW";
                    }
                    if(camera.ptp.new.cameras[0].camera.supportsNativeHDR && captureOptions && captureOptions.hdrCount && captureOptions.hdrCount > 1 && captureOptions.hdrStops > 0) {
                        options.hdrStops = captureOptions.hdrStops;
                        options.hdrCount = captureOptions.hdrCount;
                    }
                    logEvent("initiating capture...");
                    return camera.ptp.new.capture(options.destination, options, function(err, thumb, filename, raw) {
                        if(err) {
                            logErr("capture failed:", err);
                            return callback && callback(err);
                        }
                        if(captureOptions && captureOptions.mode == "test") {
                            var size = {
                                x: 120,
                                q: 80
                            }
                            logEvent("capture complete, downsizing image...");
                            image.downsizeJpeg(thumb, size, null, function(err, lowResJpg) {
                                var img;
                                if (!err && lowResJpg) {
                                    img = lowResJpg;
                                } else {
                                    img = thumb;
                                }
                                logEvent("analyzing test image exposure...");
                                image.exposureValue(img, function(err, ev, histogram) {
                                    var photoRes = {};
                                    photoRes.ev = ev;
                                    photoRes.histogram = histogram;
                                    logEvent("...processing complete, image ev", ev);
                                    intervalometer.emit("histogram", histogram);
                                    callback && callback(err, photoRes);
                                });
                            });
                        } else {
                            var photoRes = {
                                file: filename,
                                cameraCount: 1,
                                cameraResults: [],
                                thumbnailPath: thumbnailFileFromIndex(captureOptions.index),
                                ev: null
                            }
                            if(captureOptions.noDownload) {
                                logEvent("...capture complete.");
                                return callback && callback(err, photoRes);
                            }
                            if(!thumb) {
                                logEvent("capture complete, invalid thumbnail!  Using chached...");
                                thumb = intervalometer.lastThumb;
                            }
                            intervalometer.lastThumb = thumb;
                            setTimeout(function() {
                                saveThumbnail(thumb, captureOptions.index, cameraIndex, 0);
                            }, 10);

                            var completeCapture = function() {
                                var size = {
                                    x: 120,
                                    q: 80
                                }
                                logEvent("capture complete, downsizing image...");
                                image.downsizeJpeg(thumb, size, null, function(err, lowResJpg) {
                                    var img;
                                    if (!err && lowResJpg) {
                                        img = lowResJpg;
                                    } else {
                                        img = thumb;
                                    }
                                    intervalometer.lastImage = img;
                                    intervalometer.emit("photo");
                                    if(captureOptions.calculateEv) {
                                        logEvent("capture complete, analyzing image...");
                                        image.exposureValue(img, function(err, ev, histogram) {
                                            photoRes.ev = ev;
                                            photoRes.histogram = histogram;
                                            logEvent("...processing complete, image ev", ev);
                                            intervalometer.emit("histogram", histogram);
                                            callback && callback(err, photoRes);
                                        });
                                    } else {
                                        logEvent("...processing complete.");
                                        callback && callback(err, photoRes);
                                    }
                                });
                            }
                            if(options.destination == 'sd' && captureOptions.saveRaw) {
                                if(raw && filename) {
                                    var file = captureOptions.saveRaw + filename.slice(-4);
                                    var cameraIndex = 1;
                                    var writeSD = function() {
                                        if(intervalometer.status.writing) return setTimeout(writeSD, 100);
                                        if(!intervalometer.status.running) return;
                                        intervalometer.status.writing = true;
                                        logEvent("Writing", raw ? raw.length : -1, "bytes to SD card...");                                
                                        fs.writeFile(file, raw, function(err) {
                                            raw = null;
                                            intervalometer.status.writing = false;
                                            if(err) {
                                                logErr("Error writing to SD:", err);
                                                intervalometer.cancel('err');
                                                error("Failed to save RAW image to SD card!\nTime-lapse has been stopped.\nPlease verify that the camera is set to RAW (not RAW+JPEG) and that the SD card is formatted and fully inserted into the VIEW.\nSystem message: " + err);
                                            } else {
                                                logEvent("...write completed.");
                                            }
                                        });
                                        completeCapture();
                                    }
                                    writeSD();
                                } else {
                                    logErr("Unable to write to SD card!", filename, raw && raw.length);
                                    completeCapture();
                                }
                            } else {
                                completeCapture();
                            }
                        }
                    });
                }
            } else {
                return camera.ptp.capture;
            }
        case 'camera.ptp.settings':
            if(camera.ptp.new.available) {
                var base = camera.ptp.new.cameras[0].camera.exposure;
                return {
                    shutter: base.shutter,
                    aperture: base.aperture,
                    iso: base.iso,
                    lists: {
                        shutter: base.shutter.list,
                        aperture: base.aperture.list,
                        iso: base.iso.list
                    }
                }
            } else {
                return camera.ptp.settings;
            }
        case 'camera.ptp.settings-camera':
            if(camera.ptp.new.available) {
                var base = camera.ptp.new.cameras[0].camera.exposure;
                return {
                    shutter: base.shutter && base.shutter.name,
                    aperture: (base.aperture && base.aperture.name) || camera.lists.getNameFromEv(camera.lists.apertureAll, intervalometer.currentProgram.manualAperture),
                    iso: base.iso && base.iso.name,
                    details: {
                        shutter: base.shutter,
                        aperture: base.aperture,
                        iso: base.iso,
                    }
                }
            } else {
                return camera.ptp.settings;
            }
        case 'camera.ptp.settings.details':
            if(camera.ptp.new.available) {
                var base = camera.ptp.new.cameras[0].camera.exposure;
                return {
                    shutter: base.shutter,
                    aperture: base.aperture,
                    iso: base.iso,
                    lists: {
                        shutter: base.shutter.list,
                        aperture: base.aperture.list,
                        iso: base.iso.list
                    }
                }
            } else {
                return camera.ptp.settings.details;
            }
        case 'camera.ptp.settings.focusPos':
            if(camera.ptp.new.available) {
                return camera.ptp.new.cameras[0].camera.status.focusPos || 0;
            } else {
                return camera.ptp.settings.focusPos;
            }
        case 'camera.ptp.focus':
            if(camera.ptp.new.available) {
                return function(dir, steps, callback, absPos) {
                    camera.ptp.new.moveFocus(dir * steps, 1, callback, absPos);
                }
            } else {
                return camera.ptp.focus;
            }
        case 'camera.ptp.lvOff':
            if(camera.ptp.new.available) {
                return function(callback) {
                    return camera.ptp.new.liveviewMode(false, callback);
                }
            } else {
                return camera.ptp.lvOff;
            }
        case 'camera.ptp.preview':
            if(camera.ptp.new.available) {
                return function(callback) {
                    return camera.ptp.new.liveviewMode(true, callback);
                }
            } else {
                return camera.ptp.preview;
            }
    }
}


function thumbnailFileFromIndex(index, cameraIndex, hqVersion) {
    var indexStr = (index + 1).toString();
    while (indexStr.length < 5) {
        indexStr = '0' + indexStr;
    }
    if(!cameraIndex) cameraIndex = 1;
    return intervalometer.timelapseFolder + "/cam-" + cameraIndex + "-" + indexStr + (hqVersion ? "q" : "") + ".jpg"
}

function saveThumbnail(jpgBuffer, index, cameraIndex, exposureCompensation) {
    var indexStr = (index + 1).toString();
   logEvent("saving thumbnails...");
    fs.writeFile(intervalometer.timelapseFolder + "/count.txt", indexStr, function() {

        //image.downsizeJpeg(jpgBuffer, {x: 320, q: 80}, null, function(err1, jpgHQBuf) {
        //    if (!err1 && jpgHQBuf) {
        
                //image.downsizeJpegSharp(jpgHQBuf, {x: 160, q: 80}, null, exposureCompensation, function(err2, jpgBuf) {
                try {
                    image.downsizeJpeg(jpgBuffer, {x: 160, q: 80}, null, function(err2, jpgBuf) {
                        if (!err2 && jpgBuf) {
                            fs.writeFile(thumbnailFileFromIndex(index, cameraIndex, false), jpgBuf, function() {
                               logEvent("...completed save thumbnails.");
                            });
                        } else {
                            logErr("error saving thumbnail jpeg:", err2);
                        }
                    });
                } catch(e) {
                    logErr("error while saving thumbnail jpeg:", e);
                }

        //        fs.writeFile(thumbnailFileFromIndex(index, cameraIndex, true), jpgHQBuf, function() {
        //        });
        //    }
        //});
    });
}



gpio.setMode(gpio.MODE_RAW);

//gpio.setup(AUXTIP_OUT, gpio.DIR_OUT, function(err){
//    if(err) log("GPIO error: ", err);
//    gpio.write(AUXTIP_OUT, 1);
//});
//
//gpio.setup(AUXRING_OUT, gpio.DIR_OUT, function(err){
//    if(err) log("GPIO error: ", err);
//    gpio.write(AUXRING_OUT, 1);
//});

gpio.setup(HOTSHOE_IN, gpio.DIR_IN, function(err){
    if(err) logErr("GPIO error: ", err);
});

var intervalometer = new EventEmitter();

intervalometer.db = db;

intervalometer.enableLogging = false;

function log() {
    if(!intervalometer.enableLogging) return;
    if(arguments.length > 0) {
        arguments[0] = "INTERVALOMETER: (trace) " + arguments[0];
    }
    console.log.apply(console, arguments);
}

function logErr() {
    if(arguments.length > 0) {
        arguments[0] = "INTERVALOMETER: (error) " + arguments[0];
    }
    console.log.apply(console, arguments);
}

function logEvent() {
    if(arguments.length > 0) {
        arguments[0] = "INTERVALOMETER: " + arguments[0];
    }
    console.log.apply(console, arguments);
}


var timerHandle = null;
var delayHandle = null;

var rate = 0;

intervalometer.autoSettings = {
    paddingTimeMs: 2000
}

var auxMotionConfig = {
    inverted: false,
    lengthMs: 200,
    externalIntervalPaddingMs: 2500
}

// this is where the pulse length is set
//auxMotionConfig.lengthMs = 1000;
//auxMotionConfig.inverted = true;

intervalometer.timelapseFolder = false;

intervalometer.status = {
    running: false,
    frames: 0,
    framesRemaining: 0,
    rampRate: 0,
    intervalMs: 0,
    message: "",
    rampEv: null,
    autoSettings: {
        paddingTimeMs: 2000
    },
    exposure: exp
}

intervalometer.internal = {};

intervalometer.emit("intervalometer.status", intervalometer.status);

var auxTrigger = new Button('input-aux2');

var busyAuxPulse = false;
var busyPhoto = false;
var busyKeyframes = false;
var pendingPhoto = false;
var retryHandle = null;
var referencePhotoRes = null;
var retryCounter = 0;

auxTrigger.on('press', function() {
    if (intervalometer.status.running && intervalometer.currentProgram.intervalMode == 'aux' && !pendingPhoto && !intervalometer.status.waitForStartup) {
        logEvent("AUX2 trigger!");
        if(timerHandle) clearTimeout(timerHandle);
        timerHandle = setTimeout(runPhoto, 0);
    } else {
        logEvent("AUX2 trigger! (ignoring)");
    }
});

auxTrigger.on('error', function(err) {
    logErr("AUX2 error: ", err);
});

function motionSyncSetup() {
    aux2out({lengthMs: 0, invert: (auxMotionConfig.inverted && intervalometer.currentProgram && intervalometer.currentProgram.intervalMode != 'aux')}, function(){});
}
motionSyncSetup();


function motionSyncPulse(callback) {
    if (intervalometer.status.running && intervalometer.currentProgram.intervalMode != 'aux') {
        gpio.read(HOTSHOE_IN, function(err, shutterClosed) {
            log("hotshoe:", shutterClosed);
            if(shutterClosed) {
                log("=> AUX Pulse");
                busyAuxPulse = true;
                aux2out({lengthMs: auxMotionConfig.lengthMs, invert: auxMotionConfig.inverted}, function(){
                    busyAuxPulse = false;
                    log("=> AUX Pulse Complete");
                    callback && callback();
                });
            } else {
                setTimeout(motionSyncPulse, 100);
            }
        });
    } 
}

function fileInit() {
    fs.writeFileSync(intervalometer.status.timelapseFolder + "/details.csv", "frame, error, target, setting, rate, interval, timestamp, file, p, i, d\n");
}

function writeFile() {
    fs.appendFileSync(intervalometer.status.timelapseFolder + "/details.csv", intervalometer.status.frames + ", " + intervalometer.status.evDiff + "," + exp.status.targetEv + "," + intervalometer.status.rampEv + "," + exp.status.rate + "," + (intervalometer.status.intervalMs / 1000) + "," + intervalometer.status.lastPhotoTime + "," + intervalometer.status.path + "," + exp.status.pComponent + "," + exp.status.iComponent + "," + exp.status.dComponent + "\n");
    //image.writeXMP(name, intervalometer.status.evDiff);
}

function getDetails(file) {
    var d = {
        frames: intervalometer.status.frames,
        evCorrection: intervalometer.status.evDiff,
        targetEv: exp.status.targetEv,
        actualEv: intervalometer.status.rampEv,
        cameraEv: intervalometer.status.cameraEv,
        rampRate: exp.status.rate,
        intervalMs: intervalometer.status.intervalMs,
        timestamp: intervalometer.status.lastPhotoTime,
        fileName: file || intervalometer.status.path,
        p: exp.status.pComponent,
        i: exp.status.iComponent,
        d: exp.status.dComponent,
    };
    if(intervalometer.gpsData) {
        d.latitude = intervalometer.gpsData.lat;
        d.longitude = intervalometer.gpsData.lon;

        var sunmoon = meeus.sunmoon(new Date(), intervalometer.gpsData.lat, intervalometer.gpsData.lon, intervalometer.gpsData.alt);
        var sunpos = {
            azimuth: sunmoon.sunpos.az,
            altitude: sunmoon.sunpos.alt,
        }
        var moonpos = {
            azimuth: sunmoon.moonpos.az,
            altitude: sunmoon.moonpos.alt,
        }

        d.sunPos = sunpos;
        d.moonPos = moonpos;
        d.moonIllumination = sunmoon.mooninfo.illumination;
    }
    return d;
}

var startShutterEv = -1;

function calculateIntervalMs(interval, currentEv) {
    var dayEv = 8;
    var nightEv = -2;
    if (intervalometer.currentProgram.intervalMode == 'fixed') {
        return interval * 1000;
    } else {
        var newInterval = interpolate.linear([{
            x: dayEv,
            y: parseInt(intervalometer.currentProgram.dayInterval)
        }, {
            x: nightEv,
            y: parseInt(intervalometer.currentProgram.nightInterval)
        }], currentEv);
        return newInterval * 1000;
    }
}

function doKeyframeAxis(axisName, keyframes, setupFirst, interpolationMethod, position, motionFunction) {
    if(interpolationMethod != 'smooth') interpolationMethod = 'linear';
    if (intervalometer.status.running && keyframes && keyframes.length > 0 && keyframes[0].position != null) {
        var kfSet = null;
        var kfCurrent = null;

        if (setupFirst) {
            keyframes[0].seconds = 0;
            kfSet = keyframes[0].position;
            intervalometer.status.keyframeSeconds = 0;
            intervalometer.status.keyframesFrames = intervalometer.status.frames;
        } else {
            var secondsSinceStart = intervalometer.status.lastPhotoTime + (intervalometer.status.intervalMs / 1000);

            if(intervalometer.status.frames > intervalometer.status.keyframesFrames) {
                intervalometer.status.keyframesFrames = intervalometer.status.frames;
                intervalometer.status.keyframeSeconds += (intervalometer.status.intervalMs / 1000);
                var diff = secondsSinceStart - intervalometer.status.keyframeSeconds;
                intervalometer.status.keyframeSeconds += diff * ((intervalometer.status.intervalMs / 1000) / 100); // catch up within 100 seconds

                log("KF: Seconds since last: " + secondsSinceStart, "diff:", diff, "corrected:", intervalometer.status.keyframeSeconds);
            }

            var totalSeconds = 0;
            kfPoints = keyframes.map(function(kf) {
                return {
                    x: kf.seconds,
                    y: kf.position || 0
                }
            }).sort(function(a, b) {
                if(a.x < b.x) return -1;
                if(a.x > b.x) return 1;
                return 0;                
            });
            kfSet = interpolate[interpolationMethod](kfPoints, intervalometer.status.keyframeSeconds);
            log("KF: " + axisName + " target: " + kfSet, "points:", kfPoints);
        }

        if (position == null) {
            motionFunction(kfSet, axisName); // absolute setting (like ev)
        } else {
            var precision = axisName == 'focus' ? 1 : 10000; // limit precision to ensure we hit even values
            var kfTarget = Math.round(kfSet * precision) / precision;
            if (kfTarget != Math.round(position * precision) / precision) {
                var relativeMove = kfTarget - position;
                if (motionFunction) motionFunction(relativeMove, axisName, kfTarget);
            } else {
                if (motionFunction) motionFunction(null, axisName, kfTarget);
            }
        }

    } else {
        if (motionFunction) motionFunction(null, axisName);
    }
}

function calculateCelestialDistance(startPos, currentPos, trackBelowHorizon) {
    var panDiff = (currentPos.azimuth - startPos.azimuth) * 180 / Math.PI;
    var tiltDiff = (currentPos.altitude - startPos.altitude) * 180 / Math.PI;
    var altDeg = currentPos.altitude * 180 / Math.PI;
    var ease = 1;
    var easeStartDegrees = 15;
    var easeEndDegrees = -5;

    if(!trackBelowHorizon && altDeg < easeStartDegrees) {
        if(altDeg < easeEndDegrees) {
            ease = 0;
        } else {
            ease = (altDeg - easeEndDegrees) / (easeStartDegrees - easeEndDegrees);
        }
    }
    return {
        pan: panDiff,
        tilt: tiltDiff,
        ease: ease
    }
}

function getTrackingMotor(trackingMotor) {
    log("INTERVALOMETER: getTrackingMotor: no motor info found for " + trackingMotor);
    if(trackingMotor && trackingMotor != 'none') {
        var parts = trackingMotor.match(/^([A-Z]+)-([0-9]+)(r?)$/);
        if(parts && parts.length > 2) {
            var stepsPerDegree = 1;
            if(parts[1] == 'NMX') stepsPerDegree = 550.81967213;
            return {
                driver: parts[1],
                motor: parts[2],
                stepsPerDegree: stepsPerDegree
            }
        } else {
            return false;
        }
    } else {
        return false;
    }
}

function processKeyframes(setupFirst, callback) {

    var numAxes = 1;
    var axesDone = 0;

    if(intervalometer.currentProgram.scheduled) return callback();

    var checkDone = function(item) {
        axesDone++;
        log("KF: " + item + "completed");
        log("KF: " + axesDone + " of " + numAxes + " keyframe items complete");
        if (axesDone >= numAxes && callback) {
            log("KF: keyframes complete, running callback");
            callback();
        }
    }

    if(intervalometer.currentProgram.coords) {
        var sunmoon = meeus.sunmoon(new Date(), intervalometer.currentProgram.coords.lat, intervalometer.currentProgram.coords.lon, intervalometer.currentProgram.coords.alt);
        var sunPos = {
            azimuth: sunmoon.sunpos.az,
            altitude: sunmoon.sunpos.alt,
        }
        var moonPos = {
            azimuth: sunmoon.moonpos.az,
            altitude: sunmoon.moonpos.alt,
        }
    }

    var eachAxis = function(axis) {
        numAxes++;
        log("Intervalometer: KF: running axis", m);

        if(axis.type == 'keyframe') {
            if(m == 'focus') {
                doKeyframeAxis(m, axis.kf, setupFirst, axis.interpolation || 'linear', remap('camera.ptp.settings.focusPos'), function(focus, axisName, absFocus) {
                    var doFocus = function() {
                        logEvent("KF: Moving focus by " + focus + " steps (currentPos=" + remap('camera.ptp.settings.focusPos') + ")");
                        var dir = focus > 0 ? 1 : -1;
                        var steps = Math.abs(focus);
                        remap('camera.ptp.focus')(dir, steps, function() {
                            var model = remap('camera.ptp.model');
                            if(model && model.match(/fuji/i) || intervalometer.status.useLiveview) {
                                checkDone('focus');
                            } else {
                                setTimeout(function(){
                                    remap('camera.ptp.lvOff')(function(){
                                        setTimeout(function(){
                                            checkDone('focus');
                                        }, 500);                                
                                    });
                                }, 500);
                            }
                        }, absFocus);
                    }
                    focus += intervalometer.status.focusDiffNew;
                    intervalometer.status.focusDiffNew = 0;
                    if(focus) {
                        var model = remap('camera.ptp.model');
                        if(model && model.match(/fuji/i) || intervalometer.status.useLiveview) {
                            doFocus();
                        } else {
                            remap('camera.ptp.preview')(function() {
                                setTimeout(doFocus, 1000);
                            });
                        }
                    } else {
                        checkDone('focus');
                    }
                });
            } else if(m == 'ev') {
                doKeyframeAxis(m, axis.kf, setupFirst, axis.interpolation || 'linear', null, function(ev) {
                    //if (ev != null && camera.settings.ev != ev) remap('camera.setEv')(ev);
                    checkDone('ev');
                });
            } else if(m == 'interval') {
                doKeyframeAxis(m, axis.kf, setupFirst, axis.interpolation || 'linear', null, function(interval) {
                    //intervalometer.status.intervalMs = interval * 1000;
                    checkDone('interval');
                });
            } else {
                var parts = m.split('-');
                var driver = parts[0];
                var motor = parseInt(parts[1]);
                doKeyframeAxis(m, axis.kf, setupFirst, axis.interpolation || 'smooth', motion.getPosition(driver, motor), function(move, axisName) {
                    var parts = axisName.split('-');
                    if (move && parts.length == 2) {
                        var driver = parts[0];
                        var motor = parseInt(parts[1]);
                        log("KF: Moving " + axisName + " by " + move + " steps");
                        if (motion.status.available) {
                            var connected = false;
                            for(var index = 0; index < motion.status.motors.length; index++) {
                                var mo = motion.status.motors[index];
                                if(mo.driver == driver && mo.motor == motor) {
                                    connected = mo.connected;
                                    break;
                                }
                            }
                            if(connected) {
                                motion.move(driver, motor, move, function() {
                                    checkDone(axisName);
                                });
                            } else {
                                logErr("KF: error moving", axisName, "-- motor not connected");
                                checkDone(axisName);
                            }
                        } else {
                            logErr("KF: error moving -- no motion system connected");
                            checkDone(axisName);
                        }
                    } else {
                        checkDone(axisName);
                    }
                });
            }
        } else if(axis.type == 'tracking' || axis.type == 'constant') {
            var trackingTarget = null;

            if(axis.type == 'tracking' && !intervalometer.currentProgram.coords) {
                axis.type = 'disabled';
                logErr("No GPS/coordinates available for tracking calculations");
                intervalometer.emit('error', "No GPS/coordinates available for tracking calculations.  Time-lapse will continue with tracking disabled on axis " + m + ".");
            } else {
                if(axis.type == 'tracking' && intervalometer.currentProgram.trackingTarget == 'sun' && sunPos) {
                    trackingTarget = calculateCelestialDistance(intervalometer.status.sunPos, sunPos, axis.trackBelowHorizon);
                } else if(axis.type == 'tracking' && intervalometer.currentProgram.trackingTarget == 'moon' && moonPos) {
                    trackingTarget = calculateCelestialDistance(intervalometer.status.moonPos, moonPos, axis.trackBelowHorizon);
                } else if(axis.type == 'constant') {
                    if(axis.rate == null) axis.rate = 15;
                    if(axis.orientation == 'pan') {
                        trackingTarget = {
                            pan: (((new Date() / 1000) - intervalometer.status.startTime) / 3600) * parseFloat(axis.rate),
                            tilt: 0,
                            ease: 1
                        }
                    }
                    if(axis.orientation == 'tilt') {
                        trackingTarget = {
                            tilt: (((new Date() / 1000) - intervalometer.status.startTime) / 3600) * parseFloat(axis.rate),
                            pan: 0,
                            ease: 1
                        }
                    }
                }
                var motor = null;
                if(axis.motor) {
                    motor = axis.motor;
                    motor.stepsPerDegree = motor.unitSteps || 1;
                } else {
                    motor = getTrackingMotor(m);
                }
                var rev = axis.orientation == 'tilt' ? !axis.reverse : axis.reverse; // tilt axis is naturally reversed
                if(axis.motor && axis.motor.reverse) rev = !rev;
                motor.direction = rev ? -1 : 1;
            }

            if(trackingTarget) {
                if(axis.orientation == 'pan') {
                    var panDegrees = trackingTarget.pan - intervalometer.status.trackingPan;
                    if(axis.type == 'tracking') { // in case it crosses zero
                        if(panDegrees > 180) panDegrees -= 360;
                        if(panDegrees < -180) panDegrees += 360;
                    }

                    var addSkippedDegrees = panDegrees;
                    panDegrees *= trackingTarget.ease;
                    addSkippedDegrees -= panDegrees;
                    intervalometer.status.trackingPan += addSkippedDegrees;
                    if(intervalometer.status.panDiff != intervalometer.status.panDiffNew) {
                        intervalometer.status.panDiff = intervalometer.status.panDiffNew;
                    }
                    panDegrees += intervalometer.status.panDiff;
                    intervalometer.status.trackingPanEnabled = true;
                    if(panDegrees != 0) {
                        var panSteps = panDegrees * motor.stepsPerDegree;
                        if(motor.stepsPerDegree > 100) {
                            panSteps = Math.round(panSteps);
                        }
                        log("Intervalometer: tracking pan", panDegrees, intervalometer.status.trackingPan, panSteps, intervalometer.status.frames);
                        motion.move(motor.driver, motor.motor, panSteps * motor.direction, function() {
                            intervalometer.status.trackingPan += panSteps / motor.stepsPerDegree;
                            checkDone('tracking');
                        });
                    } else {
                        checkDone('tracking');
                    }
                } else if(axis.orientation == 'tilt') {
                    var tiltDegrees = trackingTarget.tilt - intervalometer.status.trackingTilt;
                    var addSkippedDegrees = tiltDegrees;
                    tiltDegrees *= trackingTarget.ease;
                    addSkippedDegrees -= tiltDegrees;
                    intervalometer.status.trackingTilt += addSkippedDegrees;
                    if(intervalometer.status.tiltDiff != intervalometer.status.tiltDiffNew) {
                        intervalometer.status.tiltDiff = intervalometer.status.tiltDiffNew;
                    }
                    tiltDegrees += intervalometer.status.tiltDiff;
                    intervalometer.status.trackingTiltEnabled = true;
                    if(tiltDegrees != 0 && axis.orientation == 'tilt') {
                        var tiltSteps = tiltDegrees * motor.stepsPerDegree;
                        if(motor.stepsPerDegree > 100) {
                            tiltSteps = Math.round(tiltSteps);
                        }
                        log("Intervalometer: tracking tilt", tiltDegrees, intervalometer.status.trackingTilt, tiltSteps, intervalometer.status.frames);
                        motion.move(motor.driver, motor.motor, tiltSteps * motor.direction, function() {
                            intervalometer.status.trackingTilt += tiltSteps / motor.stepsPerDegree;
                            checkDone('tracking');
                        });
                    } else {
                        checkDone('tracking');
                    }
                } else {
                    checkDone('tracking');
                }
            } else {
                checkDone('tracking');
            }
        } else if(axis.type == 'polar') {
            var motor = null;
            if(axis.motor) {
                motor = axis.motor;
                motor.stepsPerDegree = motor.unitSteps || 1;
            } else {
                motor = getTrackingMotor(m);
            }
            log("Intervalometer: polar: motor.stepsPerDegree =", motor.stepsPerDegree);
            var rev = axis.reverse;
            if(axis.motor && axis.motor.reverse) rev = !rev;
            var polarDirection = rev ? -1 : 1;

            var currentPolarPos = motion.getPosition(motor.driver, motor.motor);
            if(intervalometer.internal.polarStart == null) intervalometer.internal.polarStart = currentPolarPos;
            var backlashAmount = 1 * motor.stepsPerDegree;
            var degressPerHour = 15;            
            var stepsPerSecond = ((motor.stepsPerDegree * degressPerHour) / 3600) * polarDirection;

            var setupTracking = function(speed, _motor) {
                var moveBack = function(cb) {
                    log("Intervalometer: polar: moving back", "(motor", _motor.motor, ")");
                    motion.move(_motor.driver, _motor.motor, (intervalometer.internal.polarStart - currentPolarPos) + (backlashAmount * -polarDirection), function(err) {
                        if(err) log("Intervalometer: polar: err:", err);                        
                        setTimeout(cb);
                    });
                }
                var moveStart = function(cb) {
                    log("Intervalometer: polar: moving to start");
                    motion.move(_motor.driver, _motor.motor, backlashAmount * polarDirection, function(err) {
                        if(err) log("Intervalometer: polar: err:", err);
                        setTimeout(cb);
                    });
                }
                var startTracking = function() {
                    log("Intervalometer: polar: moving tracking...");
                    if(intervalometer.status.running) intervalometer.internal.polarTrackIntervalHandle = setInterval(function(){
                        log("Intervalometer: polar: continuing tracking...");
                        motion.joystick(_motor.driver, _motor.motor, speed + 1000);
                    }, 1000);
                    setTimeout(function(){
                        checkDone('polar');
                    }, 100);
                }
                if(remap('camera.ptp.settings.details').shutter.ev < -2) { // only for shutter speeds longer than 1/15
                    moveBack(function(){
                        moveStart(function(){
                            startTracking();
                        });
                    });
                } else if(intervalometer.status.frames == 0) { // take up backlash on first frame
                    moveBack(function(){
                        moveStart(function(){
                            checkDone('polar');
                        });
                    });
                } else {
                    checkDone('polar');
                }
            }
            if(intervalometer.internal.polarTrackIntervalHandle) {
                clearInterval(intervalometer.internal.polarTrackIntervalHandle);
                intervalometer.internal.polarTrackIntervalHandle = null;
                motion.joystick(motor.driver, motor.motor, 0, function(){
                    setupTracking(stepsPerSecond * polarDirection, motor);
                });
            } else {
                motion.getBacklash(motor.driver, motor.motor, function(backlash) {
                    log("Intervalometer: polar: backlash was", backlash);
                    intervalometer.internal.polarMotorBacklash = {
                        backlash: backlash,
                        driver: motor.driver,
                        motor: motor.motor
                    }
                    motion.setBacklash(motor.driver, motor.motor, 0, function() {
                        setupTracking(stepsPerSecond * polarDirection, motor);
                    });
                });
            }
        } else {
            if(m == 'focus') {
                var doFocus = function(focus) {
                    log("KF: Moving focus by " + focus + " steps");
                    var dir = focus > 0 ? 1 : -1;
                    var steps = Math.abs(focus);
                    remap('camera.ptp.focus')(dir, steps, function() {
                        var model = remap('camera.ptp.model');
                        if(model && model.match(/fuji/i) || intervalometer.status.useLiveview) {
                            checkDone('focus-update');
                        } else {
                            setTimeout(function(){
                                remap('camera.ptp.lvOff')(function(){
                                    setTimeout(function(){
                                        checkDone('focus-update');
                                    }, 500);                                
                                });
                            }, 500);
                        }
                    });
                }
                if(intervalometer.status.focusDiffNew) {
                    intervalometer.status.focusDiffNew = 0;
                    var model = remap('camera.ptp.model');
                    if(model && model.match(/fuji/i) || intervalometer.status.useLiveview) {
                        doFocus(intervalometer.status.focusDiffNew);
                    } else {
                        remap('camera.ptp.preview')(function() {
                            setTimeout(function(){
                                doFocus(intervalometer.status.focusDiffNew);
                            }, 1000);
                        });
                    }
                } else {
                    checkDone('focus-update');
                }
            } else {
                checkDone(m);
            }
        }
    }


    for(var m in intervalometer.currentProgram.axes) {
        eachAxis(intervalometer.currentProgram.axes[m]);
    }
    checkDone('function');
}


function getEvOptions() {
    var neededPadMs = intervalometer.autoSettings.paddingTimeMs;
    if(intervalometer.currentProgram.intervalMode == 'aux') {
        if(auxMotionConfig.externalIntervalPaddingMs > neededPadMs) neededPadMs = auxMotionConfig.externalIntervalPaddingMs; // add an extra padding for external motion
    } else {
        if(auxMotionConfig.lengthMs > neededPadMs) neededPadMs = auxMotionConfig.lengthMs;
    }
    var maxShutterLengthMs = (intervalometer.status.intervalMs - neededPadMs);
    if(maxShutterLengthMs < 500) maxShutterLengthMs = 500; // warn on this condition?
    logEvent("\n\nIntervalometer: total padding ms:", neededPadMs, "= max shutter ms: ", maxShutterLengthMs);
    return {
        cameraSettings: remap('camera.ptp.settings'),
        maxShutterLengthMs: maxShutterLengthMs,
        isoMax: intervalometer.currentProgram.isoMax,
        isoMin: intervalometer.currentProgram.isoMin,
        shutterMax: intervalometer.currentProgram.shutterMax,
        apertureMax: intervalometer.currentProgram.apertureMax,
        apertureMin: intervalometer.currentProgram.apertureMin,
        parameters: intervalometer.currentProgram.rampParameters || 'S+I',
        fixedApertureEv: intervalometer.currentProgram.manualAperture,
        blendParams: intervalometer.currentProgram.rampParameters && intervalometer.currentProgram.rampParameters.indexOf('=') !== -1
    }
}

var busyExposure = false;

function setupExposure(cb) {
    var expSetupStartTime = new Date() / 1000;
    var oldDriverEnableLv = intervalometer.status.useLiveview && !busyExposure && camera.ptp.settings && camera.ptp.settings.viewfinder == "off";
    var newDriverEnableLv = intervalometer.status.useLiveview && !busyExposure && camera.ptp.new.available;
    if(oldDriverEnableLv) {
        log("\n\nEXP: setupExposure (enabling LV)");
        busyExposure = true;
        return camera.ptp.liveview(function(){
            setupExposure(cb);
        });
    }
    if(newDriverEnableLv) {
        logEvent("\n\nEXP: setupExposure (enabling LV)");
        busyExposure = true;
        return camera.ptp.new.liveviewMode(true, function(){
            setupExposure(cb);
        });
    }
    busyExposure = true;

    log("\n\nEXP: setupExposure");

    var diff = 0;
    if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) {
        if(!intervalometer.status.hdrIndex) intervalometer.status.hdrIndex = 0;
        if(intervalometer.status.hdrIndex < intervalometer.status.hdrSet.length) {
            diff = intervalometer.status.hdrSet[intervalometer.status.hdrIndex];
            intervalometer.status.hdrIndex++;
        } else {
            intervalometer.status.hdrIndex = 0;
        }
        logEvent("HDR adjustment:", diff, intervalometer.status.hdrIndex);
    }

    var doSetup = function() {
        if(intervalometer.status.stopping) return cb && cb();
        log("EXP: current interval: ", intervalometer.status.intervalMs, " (took ", (new Date() / 1000 - expSetupStartTime), "seconds from setup start");
        if(intervalometer.status.rampEv == null) {
            intervalometer.status.rampEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings'));
        }
        dynamicChangeUpdate();
        if(intervalometer.status.rampMode == 'preset') {
            remap('camera.setExposure')(intervalometer.status.shutterPreset + diff, intervalometer.status.aperturePreset, intervalometer.status.isoPreset, function(err, ev) {
                if(ev != null) {
                    intervalometer.status.cameraEv = ev;
                } 
                intervalometer.status.cameraSettings = remap('camera.ptp.settings-camera');
                intervalometer.status.evDiff = intervalometer.status.cameraEv - intervalometer.status.rampEv;
                log("EXP: program (preset):", "capture", " (took ", (new Date() / 1000 - expSetupStartTime), "seconds from setup start");
                busyExposure = false;
                setTimeout(function(){
                    cb && cb(err);
                }, 100)
            });
        } else {
            if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) {
                var options = getEvOptions();
                options.doNotSet = true;
                remap('camera.setEv')(intervalometer.status.rampEv + intervalometer.status.hdrMax, options, function(err, res) {
                    if(intervalometer.status.stopping) return cb && cb();
                    remap('camera.setExposure')(res.shutter.ev + diff - intervalometer.status.hdrMax, res.aperture.ev, res.iso.ev, function(err, ev) {
                        if(ev != null) {
                            intervalometer.status.cameraEv = ev;
                        } 
                        intervalometer.status.cameraSettings = remap('camera.ptp.settings-camera');
                        intervalometer.status.evDiff = intervalometer.status.cameraEv - intervalometer.status.rampEv;
                        log("EXP: program (preset):", "capture", " (took ", (new Date() / 1000 - expSetupStartTime), "seconds from setup start");
                        busyExposure = false;
                        setTimeout(function(){
                            cb && cb(err);
                        }, 100)
                    });
                });
            } else {
                remap('camera.setEv')(intervalometer.status.rampEv + diff, getEvOptions(), function(err, res) {
                    if(res.ev != null) {
                        intervalometer.status.cameraEv = res.ev;
                    } 
                    intervalometer.status.cameraSettings = remap('camera.ptp.settings-camera');
                    intervalometer.status.evDiff = intervalometer.status.cameraEv - intervalometer.status.rampEv;
                    log("EXP: program:", "capture", " (took ", (new Date() / 1000 - expSetupStartTime), "seconds from setup start");
                    busyExposure = false;
                    setTimeout(function(){
                        cb && cb(err);
                    }, 100)
                });
            }
        }
    }
    if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0 && diff != 0) { // speed HDR performance by not refreshing settings from camera
        doSetup();
    } else {
        remap('camera.ptp.getSettings')(doSetup);
    }
}

function planHdr(hdrCount, hdrStops) {
    if(!hdrStops || hdrStops < 1/3) hdrStops = 1/3;
    if(!hdrCount || hdrCount < 1) hdrCount = 1;
    var totalHdr = Math.floor(hdrCount) - 1;
    var overHdr = Math.floor(totalHdr / 2);
    var underHdr = totalHdr - overHdr;

    var overSet = [];
    var underSet = [];

    for(var i = 0; i < overHdr; i++) {
        overSet.push(hdrStops * (i + 1));                        
    }
    for(var i = 0; i < underHdr; i++) {
        underSet.push(hdrStops * -(i + 1));                        
    }

    intervalometer.status.hdrIndex = 0;
    intervalometer.status.hdrSet = [];
    intervalometer.status.hdrMax = overHdr;

    intervalometer.status.hdrCount = hdrCount > 1 ? hdrCount : 0;
    intervalometer.status.hdrStops = hdrCount > 1 ? hdrStops : 0;
    
    if(!camera.ptp.new.available || !(camera.ptp.new.cameras && camera.ptp.new.cameras[0] && camera.ptp.new.cameras[0].camera && camera.ptp.new.cameras[0].camera.supportsNativeHDR)) {
        while(overSet.length || underSet.length) {
            if(overSet.length) intervalometer.status.hdrSet.push(overSet.shift());
            if(underSet.length) intervalometer.status.hdrSet.push(underSet.shift());
        }
        log("planHdr:", intervalometer.status.hdrSet)
    }
}

function checkCurrentPlan(restart) {
    if(intervalometer.currentProgram.exposurePlans && intervalometer.currentProgram.exposurePlans.length > 0) {
        var planIndex = null;                        
        var now = (new Date()).getTime();
        for(var i = 0; i < intervalometer.currentProgram.exposurePlans.length; i++) {
            //log("PLAN: now", now, "plan.start", new Date(intervalometer.currentProgram.exposurePlans[i].start).getTime());
            if((new Date(intervalometer.currentProgram.exposurePlans[i].start)).getTime() < now) {
                planIndex = i;
            } else {
                break;
            }
        }
        //log("PLAN: checking plans...", planIndex);
        if(intervalometer.status.currentPlanIndex !== planIndex) {
            intervalometer.status.currentPlanIndex = planIndex;
            intervalometer.status.framesRemaining = Infinity;
            var plan = intervalometer.currentProgram.exposurePlans[planIndex];
            log("PLAN: switching to ", plan.name);
            /*
                each plan has the following:
                .mode = 'preset', 'lock', 'auto'
                .ev = EV (if .mode == 'fixed')
                .hdrCount  = 0, 1 = none, 2+ = hdr
                .hdrStops = stops between each hdr photo
                .intervalMode = 'fixed', 'auto'
                .interval
                .dayInterval
                .nightIntervl
            */
            if(plan.mode == 'auto') {
                intervalometer.status.rampMode = 'auto';
                if(intervalometer.status.rampEv == null) intervalometer.status.rampEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings')); 
            }
            if(plan.mode == 'lock') {
                if(intervalometer.status.rampEv == null) intervalometer.status.rampEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings')); 
                intervalometer.status.rampMode = 'fixed';
            }
            if(plan.mode == 'preset') {
                intervalometer.status.rampMode = 'preset';
                intervalometer.status.shutterPreset = plan.shutter;
                intervalometer.status.aperturePreset = plan.aperture;
                intervalometer.status.isoPreset = plan.iso;
                intervalometer.status.rampEv = camera.lists.getEv(intervalometer.status.shutterPreset, intervalometer.status.aperturePreset, intervalometer.status.isoPreset);
            }
            if(intervalometer.currentProgram.intervalMode != 'aux') {
                intervalometer.currentProgram.intervalMode = plan.intervalMode;
                if(plan.intervalMode == 'fixed') {
                    intervalometer.currentProgram.interval = plan.interval;
                }
                else if(plan.intervalMode == 'auto') {
                    intervalometer.currentProgram.dayInterval = plan.dayInterval;
                    intervalometer.currentProgram.nightInterval = plan.nightInterval;
                }
            }
            planHdr(plan.hdrCount, plan.hdrStops);

            if(restart) {
                if (timerHandle) clearTimeout(timerHandle);
                setupExposure(runPhoto);
            }
            return true;
        }
    }
    return false;
}

function checkDay(m) {
    switch(m.day()) {
        case 0:
            return intervalometer.currentProgram.schedSunday;
        case 1:
            return intervalometer.currentProgram.schedMonday;
        case 2:
            return intervalometer.currentProgram.schedTuesday;
        case 3:
            return intervalometer.currentProgram.schedWednesday;
        case 4:
            return intervalometer.currentProgram.schedThursday;
        case 5:
            return intervalometer.currentProgram.schedFriday;
        case 6:
            return intervalometer.currentProgram.schedSaturday;
    }
}

function checkTime(m) {
    if(intervalometer.currentProgram.schedStart == intervalometer.currentProgram.schedStop) return true;

    if(!intervalometer.currentProgram.schedStart || typeof intervalometer.currentProgram.schedStart != "string") return true;
    if(!intervalometer.currentProgram.schedStop || typeof intervalometer.currentProgram.schedStop != "string") return true;

    var parts = intervalometer.currentProgram.schedStart.split(':');
    if(parts.length < 2) return true;
    var startHour = parseInt(parts[0]);
    var startMinute = parseInt(parts[1]);
    parts = intervalometer.currentProgram.schedStop.split(':');
    if(parts.length < 2) return true;
    var stopHour = parseInt(parts[0]);
    var stopMinute = parseInt(parts[1]);

    var mNow = m.hour() * 60 + m.minute();
    var mStart = startHour * 60 + startMinute;
    var mStop = stopHour * 60 + stopMinute;

    log("Intervalometer: mNow", mNow, "mStart", mStart, "mStop", mStop);

    intervalometer.status.minutesUntilStart = Math.round(mStart - mNow);
    if(mStart < mStop) { // day only
        return (mNow >= mStart && mNow < mStop);
    } else { // night only
        return (mNow >= mStart || mNow < mStop);
    }
}

var scheduleHandle = null;
function waitForSchedule() {
    scheduleHandle = setTimeout(function(){
        if(scheduled(true)) {
            if(intervalometer.status.running) {
                log("Intervalometer: scheduled start beginning...");
                if(intervalometer.status.frames > 0) {
                    intervalometer.cancel('scheduled', function(){ // each day a new clip is generated
                        setTimeout(function(){
                            log("Intervalometer: running scheduled start...");
                            intervalometer.run(intervalometer.currentProgram, null, intervalometer.status.timeOffsetSeconds, intervalometer.status.exposureReferenceEv);
                        });
                    });
                } else {
                    setTimeout(function(){
                        log("Intervalometer: running scheduled start...");
                        intervalometer.run(intervalometer.currentProgram, null, intervalometer.status.timeOffsetSeconds, intervalometer.status.exposureReferenceEv || 0);
                    });
                }
             } else {
                log("Intervalometer: scheduled start canceled because time-lapse is no longer running.");
             }
        } else {
            waitForSchedule();
        }
    }, 60000);
}

function scheduled(noResume) {
    if(intervalometer.currentProgram && intervalometer.currentProgram.scheduled) {
        var m = moment().add(intervalometer.status.timeOffsetSeconds, 'seconds');
        if(checkDay(m)) {
            if(checkTime(m)) {
                console.trace("Intervalometer: scheduled start ready");
                return true;
            } else {
                if(intervalometer.status.minutesUntilStart < 0) {
                    intervalometer.status.message = "done for today...";
                } else {
                    var minutes = intervalometer.status.minutesUntilStart % 60;
                    var hours = (intervalometer.status.minutesUntilStart - minutes) / 60;
                    if(hours > 0) {
                        intervalometer.status.message = "starting in " + hours + "hour" + (hours > 1 ? "s, ":", ") + minutes + " minute" + (minutes > 1 ? "s...":"...");
                    } else {
                        intervalometer.status.message = "starting in " + minutes + " minute" + (minutes > 1 ? "s...":"...");
                    }
                }
                intervalometer.emit("intervalometer.status", intervalometer.status);

                if(!noResume) waitForSchedule();
                return false;
            }
        } else {
            intervalometer.status.message = "not scheduled today, waiting...";
            intervalometer.emit("intervalometer.status", intervalometer.status);
            if(!noResume) waitForSchedule();
            return false;
        }
    } else {
        return true;
    }
}

function runPhoto(isRetry) {
    //log("#############################");
    if(!intervalometer.status.running) {
        busyPhoto = false;
        busyExposure = false;
        pendingPhoto = false;
        busyKeyframes = false;
        intervalometer.status.stopping = false;
        return;
    }

    if(busyAuxPulse) return setTimeout(runPhoto, 100);
    
    if((busyPhoto || busyExposure) && pendingPhoto && !isRetry) {
        log("INTERVALOMETER: dropping frame!");
        return; // drop frame if backed up
    }

    if ((busyPhoto || busyExposure || busyKeyframes) && intervalometer.currentProgram.rampMode != "fixed") {
        if(retryCounter == 0) {
            if(busyPhoto) log("P");
            if(busyExposure) log("E");
            if(busyKeyframes) log("K");
        }
        retryCounter++;
        if(retryCounter >= 20) retryCounter = 0;
        if (intervalometer.status.running) retryHandle = setTimeout(function(){runPhoto(true);}, 100);
        return;
    }
    if(!intervalometer.status.running) return;
    if(intervalometer.status.first) {
        intervalometer.status.first = false;
        return setTimeout(function() {
            setupExposure(runPhoto);
        });
    }
    if(busyPhoto || busyExposure) pendingPhoto = true; else pendingPhoto = false;
    busyPhoto = true;
    if (remap('camera.ptp.connected')) {
        //console.trace("Starting Photo...");
        if(intervalometer.status.useLiveview && !camera.ptp.new.available && !camera.ptp.lvOn) camera.ptp.liveview();
        if(intervalometer.status.useLiveview && camera.ptp.new.available && !camera.ptp.new.cameras[0].camera.status.liveview) camera.ptp.new.liveviewMode(true);
        if(!(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) || intervalometer.status.hdrIndex == 1) {
            intervalometer.status.captureStartTime = new Date() / 1000;
        }
        intervalometer.emit("intervalometer.status", intervalometer.status);
        var captureOptions = {
            thumbnail: true,
            index: intervalometer.status.frames,
            noDownload: (intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0 && intervalometer.status.hdrIndex > 0) // only fetch thumbnail for the reference photo in the HDR set
                //saveTiff: "/mnt/sd/test" + intervalometer.status.frames + ".tiff",
                //saveRaw: "/mnt/sd/test" + intervalometer.status.frames + ".cr2",
        }
        if (intervalometer.currentProgram.destination == 'sd' && camera.ptp.sdPresent && camera.ptp.sdMounted) {
            log("CAPT: Saving timelapse to SD card");
            captureOptions.thumbnail = false;
            var framesPadded = intervalometer.status.frames.toString();
            while (framesPadded.length < 4) framesPadded = '0' + framesPadded;
            captureOptions.saveRaw = intervalometer.status.mediaFolder + "/img-" + framesPadded;
            camera.ptp.saveToCameraCard(false);
        } else {
            camera.ptp.saveToCameraCard(true);
        }

        if (intervalometer.currentProgram.rampMode == "fixed") {
            intervalometer.status.intervalMs = intervalometer.currentProgram.interval * 1000;
            if (intervalometer.status.running && scheduled()) timerHandle = setTimeout(runPhoto, intervalometer.status.intervalMs);
            setTimeout(motionSyncPulse, camera.lists.getSecondsFromEv(remap('camera.ptp.settings.details').shutter.ev) * 1000 + 1500);
            captureOptions.calculateEv = false;
            intervalometer.status.lastPhotoTime = new Date() / 1000 - intervalometer.status.startTime;
            if(intervalometer.status.hdrCount && intervalometer.status.hdrCount > 1 && intervalometer.status.hdrStops > 0) {
                captureOptions.hdrCount = intervalometer.status.hdrCount;
                captureOptions.hdrStops = intervalometer.status.hdrStops;
            }
            remap('camera.ptp.capture')(captureOptions, function(err, photoRes) {
                if (!err && photoRes) {
                    intervalometer.status.path = photoRes.file;
                    if(photoRes.cameraCount > 1) {
                        for(var i = 0; i < photoRes.cameraResults.length; i++) {
                            log("photoRes.cameraResults[" + i + "]:", photoRes.cameraResults[i].file, photoRes.cameraResults[i].cameraIndex, photoRes.cameraResults[i].thumbnailPath);
                            db.setTimelapseFrame(intervalometer.status.id, 0, getDetails(photoRes.cameraResults[i].file), photoRes.cameraResults[i].cameraIndex, photoRes.cameraResults[i].thumbnailPath);
                        }
                    } else {
                        db.setTimelapseFrame(intervalometer.status.id, 0, getDetails(), 1, photoRes.thumbnailPath);
                    }
                    intervalometer.status.message = "running";
                    if (intervalometer.status.framesRemaining > 0) intervalometer.status.framesRemaining--;
                    intervalometer.status.frames++;
                    //writeFile();
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                    log("TL: program intervalometer.status:", JSON.stringify(intervalometer.status));
                } else {
                    logErr("error occurred during capture", err);
                    intervalometer.emit('error', "An error occurred during capture.  This could mean that the camera body is not supported or possibly an issue with the cable disconnecting.\nThe time-lapse will attempt to continue anyway.\nSystem message: ", err);
                }
                if ((intervalometer.status.framesRemaining < 1 && !intervalometer.currentProgram.scheduled) || intervalometer.status.running == false || intervalometer.status.stopping == true) {
                    clearTimeout(timerHandle);
                    intervalometer.status.message = "done";
                    intervalometer.status.framesRemaining = 0;
                    intervalometer.cancel('done');
                }
                dynamicChangeUpdate();
                busyKeyframes = true;
                busyPhoto = false;
                processKeyframes(false, function() {
                    busyKeyframes = false;
                    pendingPhoto = false;
                });
                try {
                  if (global.gc) {global.gc();}
                } catch (e) {
                  console.log("INTERVALOMETER: garbage collection failed:", e);
                }
            });
        } else {
            if (intervalometer.status.rampEv === null) {
                intervalometer.status.cameraEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings')); 
                intervalometer.status.rampEv = intervalometer.status.cameraEv;
            }
            captureOptions.exposureCompensation = intervalometer.status.evDiff || 0;

            if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) {
                if(intervalometer.status.hdrIndex == 0) {
                    captureOptions.calculateEv = true;
                } else {
                    captureOptions.calculateEv = false;
                }
            } else {
                captureOptions.calculateEv = true;
            }

            if(intervalometer.currentProgram.intervalMode == 'aux') {
                if(intervalometer.status.intervalStartTime) intervalometer.status.intervalMs = ((new Date() / 1000) - intervalometer.status.intervalStartTime) * 1000;
                intervalometer.status.intervalStartTime = new Date() / 1000;
            } else if(!(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) || intervalometer.status.hdrIndex == 1) { // only start interval timer at first HDR exposure
                intervalometer.status.intervalMs = calculateIntervalMs(intervalometer.currentProgram.interval, intervalometer.status.rampEv);                
                log("TL: Setting timer for interval at ", intervalometer.status.intervalMs);
                if (timerHandle) clearTimeout(timerHandle);
                var runIntervalHdrCheck = function() {
                    if(!(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) || intervalometer.status.hdrIndex == 1) {
                        runPhoto();
                    } else {
                        log("HDR: delaying interval for HDR set");
                        if (intervalometer.status.running) timerHandle = setTimeout(runIntervalHdrCheck, 100);
                    }
                }
                if (intervalometer.status.running && scheduled()) timerHandle = setTimeout(runIntervalHdrCheck, intervalometer.status.intervalMs);
            } 

            intervalometer.emit("intervalometer.status", intervalometer.status);
            var shutterEv;
            if(remap('camera.ptp.settings.details') && remap('camera.ptp.settings.details').shutter) shutterEv = remap('camera.ptp.settings.details').shutter.ev; else shutterEv = 0;

            if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0 && intervalometer.status.hdrIndex > 0 && intervalometer.status.rampEv + intervalometer.status.hdrMax >= camera.maxEv(remap('camera.ptp.settings'), getEvOptions())) {
                intervalometer.status.hdrIndex = 0; // disable HDR is the exposure is at the maximum
            }
            if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0 && intervalometer.status.hdrIndex > 0) {
                if(checkCurrentPlan(true)) {
                    busyPhoto = false;
                    return;
                }
                //var nextHDRms = 100 + camera.lists.getSecondsFromEv(shutterEv) * 1000;
                //log("running next in HDR sequence", intervalometer.status.hdrIndex, nextHDRms);
                remap('camera.ptp.capture')(captureOptions, function(err, res) {
                    setupExposure(function(){
                        busyPhoto = false;
                        runPhoto()
                    });
                });
                //setTimeout(function(){
                //    setupExposure(function(){
                //        busyPhoto = false;
                //        runPhoto()
                //    });
                //}, nextHDRms);
                return;
            } else {
                var msDelayPulse = camera.lists.getSecondsFromEv(shutterEv) * 1000 + 1500;
                setTimeout(motionSyncPulse, msDelayPulse);
                intervalometer.status.lastPhotoTime = new Date() / 1000 - intervalometer.status.startTime;
            }
            if(intervalometer.status.hdrCount && intervalometer.status.hdrCount > 1 && intervalometer.status.hdrStops > 0) {
                captureOptions.hdrCount = intervalometer.status.hdrCount;
                captureOptions.hdrStops = intervalometer.status.hdrStops;
            }
            remap('camera.ptp.capture')(captureOptions, function(err, photoRes) {
                if (!err && photoRes) {
                    if(!intervalometer.status.hdrIndex) referencePhotoRes = photoRes;

                    var bufferTime = (new Date() / 1000) - intervalometer.status.captureStartTime - camera.lists.getSecondsFromEv(remap('camera.ptp.settings.details').shutter.ev);
                    if(!intervalometer.status.bufferSeconds) {
                        intervalometer.status.bufferSeconds = bufferTime;
                    } else if(bufferTime != intervalometer.status.bufferSeconds) {
                        intervalometer.status.bufferSeconds = (intervalometer.status.bufferSeconds + bufferTime) / 2;
                    }
                    intervalometer.status.path = referencePhotoRes.file;
                    if(referencePhotoRes.cameraCount > 1) {
                        for(var i = 0; i < referencePhotoRes.cameraResults.length; i++) {
                            db.setTimelapseFrame(intervalometer.status.id, intervalometer.status.evDiff, getDetails(referencePhotoRes.cameraResults[i].file), referencePhotoRes.cameraResults[i].cameraIndex, referencePhotoRes.cameraResults[i].thumbnailPath);
                        }
                    } else {
                        db.setTimelapseFrame(intervalometer.status.id, intervalometer.status.evDiff, getDetails(), 1, referencePhotoRes.thumbnailPath);
                    }
                    intervalometer.autoSettings.paddingTimeMs = intervalometer.status.bufferSeconds * 1000 + 500; // add a half second for setting exposure

                    var model = remap('camera.ptp.model');
                    if(model && model.match(/5DS/i)) intervalometer.autoSettings.paddingTimeMs += 1000; // add one second for 5DS

                    if(intervalometer.status.rampMode == "auto") {
                        intervalometer.status.rampEv = exp.calculate(intervalometer.currentProgram.rampAlgorithm, intervalometer.currentProgram.lrtDirection, intervalometer.status.rampEv, referencePhotoRes.ev, referencePhotoRes.histogram, camera.minEv(remap('camera.ptp.settings'), getEvOptions()), camera.maxEv(remap('camera.ptp.settings'), getEvOptions()));
                        intervalometer.status.rampRate = exp.status.rate;
                    } else if(intervalometer.status.rampMode == "fixed") {
                        intervalometer.status.rampRate = 0;
                    }

                    intervalometer.status.path = referencePhotoRes.file;
                    intervalometer.status.message = "running";                    
                    if(!checkCurrentPlan(true)) setupExposure();

                    if (intervalometer.status.framesRemaining > 0) intervalometer.status.framesRemaining--;
                    intervalometer.status.frames++;
                    writeFile();
                    if(intervalometer.currentProgram.intervalMode == 'aux') intervalometer.status.message = "waiting for AUX2...";
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                    log("TL: program intervalometer.status:", JSON.stringify(intervalometer.status));
                    if(intervalometer.status.frames == 1 && intervalometer.status.exposureReferenceEv == null) {
                        brightWarning(photoRes.ev);
                    }

                } else {
                    if(!err) err = "unknown";
                    error("An error occurred during capture.  This could mean that the camera body is not supported or possibly an issue with the cable disconnecting.\nThe time-lapse will attempt to continue anyway.\nSystem message: " + err);
                    logErr("capture error:", err);
                }
                if ((intervalometer.currentProgram.intervalMode == "fixed" && intervalometer.status.framesRemaining < 1) || intervalometer.status.running == false || intervalometer.status.stopping == true) {
                    clearTimeout(timerHandle);
                    intervalometer.status.stopping = false;
                    intervalometer.status.message = "done";
                    intervalometer.status.framesRemaining = 0;
                    intervalometer.cancel('done');
                }
                busyKeyframes = true;
                busyPhoto = false;
                processKeyframes(false, function() {
                    busyKeyframes = false;
                    pendingPhoto = false;
                    log("INTERVALOMETER: KF completed.");
                });

                try {
                  if (global.gc) {global.gc();}
                } catch (e) {
                  console.log("INTERVALOMETER: garbage collection failed:", e);
                }
            });
        }
    }
}

function brightWarning(ev) {
    if(ev > 2.5) {
        logErr("warn exposure too high")
        error("WARNING: the exposure is too high for reliable ramping. It will attempt to continue, but it's strongly recommended to stop the time-lapse, descrease the exposure to expose for the highlights and then start again.");
    }
}

function error(msg, callback) {
    log("INTERVALOMETER: error:", msg);
    setTimeout(function(){
        intervalometer.emit("error", msg);
    }, 50);
    setTimeout(function(){
        return callback && callback(msg);
    }, 100);
}

camera.ptp.on('saveError', function(msg) {
    if (intervalometer.status.running) {
        intervalometer.cancel('err');
        logErr("failed saving to SD card:", msg);
        error("Failed to save RAW image to SD card!\nTime-lapse has been stopped.\nPlease verify that the camera is set to RAW (not RAW+JPEG) and that the SD card is formatted and fully inserted into the VIEW.\nSystem message: " + msg);
    }
});
camera.ptp.on('saveErrorCardFull', function(msg) {
    if (intervalometer.status.running) {
        intervalometer.cancel('err');
        logErr("SD card full, save failed:", msg);
        error("SD card full! Unabled to save RAW images.\nThe time-lapse has been stopped.");
    }
});

function autoSetExposure(offset, callback) {
    if(!offset) offset = 0;
    function captureTestEv() {
        remap('camera.ptp.capture')({mode:'test'}, function(err, res) {
            if(!err && res && res.ev != null) {
                intervalometer.status.message = "checking/setting exposure...";
                intervalometer.emit("intervalometer.status", intervalometer.status);
                var evChange = res.ev - offset;
                remap('camera.ptp.getSettings')(function() {
                    var currentEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings'));
                    remap('camera.setEv')(currentEv + evChange, getEvOptions(), function(err, res) {
                        if(Math.abs(evChange) < 2) {
                            callback && callback(null);
                        } else {
                            captureTestEv();
                        }
                    })
                });
            } else {
                callback && callback(err||"invalid exposure");
            }
        });
    }
    captureTestEv();
}

intervalometer.validate = function(program) {
    var results = {
        errors: []
    };
    if(program.frames === null) program.frames = Infinity;
    
    if (parseInt(program.delay) < 1) program.delay = 1;
    if(program.scheduled) program.delay = 0;
    if(program.rampMode == 'fixed' && !program.scheduled) {
        if (parseInt(program.frames) < 1) results.errors.push({param:'frames', reason: 'frame count not set'});
    } else {
        if(program.intervalMode == 'fixed' || program.rampMode == 'fixed') {
            if (parseInt(program.interval) < 1) results.errors.push({param:'interval', reason: 'interval not set or too short'});
        } else {
            if (parseInt(program.dayInterval) < 2) results.errors.push({param:'dayInterval', reason: 'dayInterval must be at least 2 seconds'});
            if (parseInt(program.nightInterval) < program.dayInterval) results.errors.push({param:'nightInterval', reason: 'nightInterval shorter than dayInterval'});
        }        
    }

    if(!remap('camera.ptp.supports.destination') && (program.destination != 'sd' || !camera.ptp.sdPresent)) {
        log("VAL: Error: SD card required");
        results.errors.push({param:false, reason: "SD card required. The connected camera (" + remap('camera.ptp.model') + ") does not support saving images to the camera.  Please insert an SD card into the VIEW and set the Destination to 'SD Card' so images can be saved to the card."});
    }

    var settingsDetails = remap('camera.ptp.settings.details');

    if(!settingsDetails) {
        log("VAL: Error: invalid cameras settings", settingsDetails);
        results.errors.push({param:false, reason: "unable to read camera settings."});
    } else {
    
        if((!settingsDetails.iso || settingsDetails.iso.ev == null) && program.rampMode != 'fixed') {
            log("VAL: Error: invalid ISO setting", settingsDetails.iso);
            results.errors.push({param:false, reason: "invalid ISO setting on camera."});
        }

        if((!settingsDetails.shutter || settingsDetails.shutter.ev == null) && program.rampMode != 'fixed') {
            log("VAL: Error: invalid shutter setting", settingsDetails.shutter);
            results.errors.push({param:false, reason: "invalid shutter setting on camera."});
        }

        if(remap('camera.ptp.settings') && remap('camera.ptp.settings.format') != 'RAW' && program.destination == 'sd' && camera.ptp.sdPresent) {
            if(remap('camera.ptp.model') == 'SonyWifi') {
                log("VAL: Error: SonyWifi doesn't support Destination='SD'");
                results.errors.push({param:false, reason: "Destination must be set to 'Camera' when connected to Sony cameras via Wifi"});
            } else {
                log("VAL: Error: camera not set to save in RAW");
                results.errors.push({param:false, reason: "camera must be set to save in RAW. The VIEW expects RAW files when processing images to the SD card (RAW+JPEG does not work)"});
            }
        }
    }


    if(!program.axes) program.axes = {};
    if(!program.axes.focus) program.axes.focus = {type:'disabled'}; // make focus adjustment available

    log("VAL: validating program:", results);

    return results;
}
intervalometer.cancel = function(reason, callback) {
    if(!callback && typeof reason == 'function') {
        callback = reason;
        reason = null;
    }
    log("Cancelling time-lapse, reason =", reason);
    if(!reason) reason = 'stopped';
    if(intervalometer.internal.polarTrackIntervalHandle) {
        log("polar: stopping tracking motion");
        clearInterval(intervalometer.internal.polarTrackIntervalHandle);
        intervalometer.internal.polarTrackIntervalHandle = null;
        motion.joystick(intervalometer.internal.polarMotorBacklash.driver, intervalometer.internal.polarMotorBacklash.motor, 0);
    }
    if(intervalometer.internal.polarMotorBacklash) {
        setTimeout(function(){
            log("Intervalometer: polar: resetting backlash to", intervalometer.internal.polarMotorBacklash.backlash);
            motion.setBacklash(intervalometer.internal.polarMotorBacklash.driver, intervalometer.internal.polarMotorBacklash.motor, intervalometer.internal.polarMotorBacklash.backlash, function(){
                intervalometer.internal.polarMotorBacklash = null;
            });
        }, 2000);
    }
    if (intervalometer.status.running) {
        clearTimeout(timerHandle);
        clearTimeout(delayHandle);
        intervalometer.status.stopping = true;
        if(reason == 'err') intervalometer.status.message = "stopped due to error";
        else if(reason == 'done') intervalometer.status.message = "time-lapse complete";
        else if(reason == 'schedule') intervalometer.status.message = "time-lapse stopped on schedule";
        else intervalometer.status.message = "time-lapse canceled";
        intervalometer.status.framesRemaining = 0;
        intervalometer.emit("intervalometer.status", intervalometer.status);
        camera.ptp.completeWrites(function() {
            var finalize = function() {
                if(intervalometer.status.writing) {
                    console.log("INTERVALOMETER: writing...");
                    return setTimeout(finalize, 100);
                }
                setTimeout(function(){
                    if(intervalometer.status.hdrSet && intervalometer.status.hdrSet.length > 0) {
                        remap('camera.ptp.getSettings')(function() {
                            var options = getEvOptions();
                            remap('camera.setEv')(intervalometer.status.rampEv, options);
                        });
                    }
                    busyPhoto = false;
                    intervalometer.status.running = false;
                    intervalometer.status.stopping = false;
                    intervalometer.timelapseFolder = false;
                    camera.ptp.saveThumbnails(intervalometer.timelapseFolder);
                    camera.ptp.unmountSd();
                    if(intervalometer.status.useLiveview) remap('camera.ptp.lvOff');
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                    logEvent("==========> END TIMELAPSE", intervalometer.status.tlName, "(", reason, ")");
                    callback && callback();
                }, 100);
            }
            finalize();
        });
    } else {
        intervalometer.emit("intervalometer.status", intervalometer.status);
    }   
}

intervalometer.resume = function() {
    log("Intervalometer: resuming time-lapse...")
    camera.ptp.cancelCallbacks();
    busyPhoto = false;
    busyExposure = false;
    clearTimeout(timerHandle);
    clearTimeout(delayHandle);
    clearTimeout(retryHandle);
    clearTimeout(scheduleHandle);
    if(intervalometer.internal.polarTrackIntervalHandle && intervalometer.internal.polarMotorBacklash) {
        log("Intervalometer: polar: stopping tracking motion for resume");
        clearInterval(intervalometer.internal.polarTrackIntervalHandle);
        intervalometer.internal.polarTrackIntervalHandle = null;
        motion.joystick(intervalometer.internal.polarMotorBacklash.driver, intervalometer.internal.polarMotorBacklash.motor, 0);
    }
    if(intervalometer.status.rampMode != 'fixed' && intervalometer.status.rampEv != null && intervalometer.status.running) {
        camera.setEv(intervalometer.status.rampEv, getEvOptions());
    }
    var ms = intervalometer.status.intervalMs - ((new Date() / 1000) - (intervalometer.status.startTime + intervalometer.status.lastPhotoTime)) * 1000;
    if(ms < 0) ms = 0;
    if(scheduled() && intervalometer.status.running) setTimeout(runPhoto, ms);
}

function getReferenceExposure(callback) {
    intervalometer.status.message = "capturing reference image";
    intervalometer.emit("intervalometer.status", intervalometer.status);
    remap('camera.ptp.capture')({mode:'test'}, function(err, res){
        log("reference exposure result:", err, res);
        if(!err && res && res.ev != null) {
            callback && callback(null, res.ev);
        } else {
            callback && callback("Failed to determine reference exposure for delayed start", null);
        }
    });
}

intervalometer.run = function(program, date, timeOffsetSeconds, autoExposureTarget, callback) {
    if (intervalometer.status.running && autoExposureTarget == null) return;
    intervalometer.status.stopping = false;
    log("loading time-lapse program:", program);
    db.set('intervalometer.currentProgram', program);

    if(date != null) { // sync time with phone app local time
        var mD = moment(date);
        var mN = moment();
        log("Intervalometer: App time:", mD.format(), "VIEW time:", mN.format());
        var daysDiff = mD.day() - mN.day();
        var hoursDiff = mD.hour() - mN.hour();
        var minutesDiff = mD.minute() - mN.minute();
        var secondsDiff = mD.seconds() - mN.seconds();
        intervalometer.status.timeOffsetSeconds = daysDiff * 86400 + hoursDiff * 3600 + minutesDiff * 60 + secondsDiff;
        log("Intervalometer: date difference (seconds):", intervalometer.status.timeOffsetSeconds);
    } else if(timeOffsetSeconds != null) { // cached timeOffsetSeconds from restart
        intervalometer.status.timeOffsetSeconds = parseInt(timeOffsetSeconds);
    }
    if(!intervalometer.status.timeOffsetSeconds) intervalometer.status.timeOffsetSeconds = 0;
    if(autoExposureTarget != null && program.rampMode == 'auto') {
        intervalometer.status.exposureReferenceEv = autoExposureTarget;
    } else {
        intervalometer.status.exposureReferenceEv = null;
    }

    if(program.manualAperture != null) {
        camera.fixedApertureEv = program.manualAperture;
        camera.lists.fixedApertureEv = program.manualAperture;    
    }

    if (remap('camera.ptp.connected')) {
        remap('camera.ptp.getSettings')(function(){
            var validationResults = intervalometer.validate(program);
            if (validationResults.errors.length == 0) {
                db.getTimelapseIndex(function(err, tlIndex){

                    if (!tlIndex) {
                        tlIndex = 0;
                    }
                    if(tlIndex < 99) tlIndex += 99;

                    var list = fs.readdirSync(TLROOT);
                    //log("Intervalometer: time-lapse list:", list);
                    var name;
                    do {
                        tlIndex++;
                        name = "tl-" + tlIndex;
                    } while(list.indexOf(name) !== -1);

                    intervalometer.status.tlName = "tl-" + tlIndex;
                    logEvent("==========> TIMELAPSE START", intervalometer.status.tlName);
                    intervalometer.timelapseFolder = TLROOT + "/" + intervalometer.status.tlName;
                    fs.mkdirSync(intervalometer.timelapseFolder);
                    camera.ptp.saveThumbnails(intervalometer.timelapseFolder);
                    intervalometer.status.timelapseFolder = intervalometer.timelapseFolder;
                    fileInit();

                    busyPhoto = false;
                    intervalometer.currentProgram = program;
                    intervalometer.lastThumb = null;
                    intervalometer.lastImage = null;
                    intervalometer.lastPhotoTime = null;
                    intervalometer.status.intervalMs = program.interval * 1000;
                    intervalometer.status.message = "starting";
                    intervalometer.status.frames = 0;
                    intervalometer.status.first = program.rampMode == 'fixed' ? false : true; // triggers setup exposure before first capture unless fixed mode
                    intervalometer.status.rampMode = program.rampMode == 'fixed' ? 'fixed' : 'auto';
                    intervalometer.status.framesRemaining = (program.intervalMode == "auto" && intervalometer.status.rampMode == "auto") ? Infinity : program.frames;
                    intervalometer.status.startTime = new Date() / 1000;
                    intervalometer.status.rampEv = null;
                    intervalometer.status.bufferSeconds = 0;
                    intervalometer.status.cameraSettings = remap('camera.ptp.settings-camera');
                    intervalometer.status.hdrSet = [];
                    intervalometer.status.hdrIndex = 0;
                    intervalometer.status.hdrCount = 0;
                    intervalometer.status.currentPlanIndex = null;
                    intervalometer.status.panDiffNew = 0;
                    intervalometer.status.tiltDiffNew = 0;
                    intervalometer.status.focusDiffNew = 0;
                    intervalometer.status.panDiff = 0;
                    intervalometer.status.tiltDiff = 0;
                    intervalometer.status.trackingPanEnabled = false;
                    intervalometer.status.trackingTiltEnabled = false;
                    intervalometer.status.dynamicChange = {};
                    intervalometer.status.trackingTilt = 0;
                    intervalometer.status.trackingPan = 0;

                    intervalometer.internal.polarStart = null;
                    intervalometer.internal.polarTrackIntervalHandle = null;

                    if(program.hdrCount && program.hdrCount > 1 && program.hdrStops) {
                        planHdr(program.hdrCount, program.hdrStops);
                    }

                    if(intervalometer.status.rampMode != 'fixed') {
                        checkCurrentPlan();
                    }

                    motionSyncSetup();

                    if(intervalometer.currentProgram.coords) {
                        intervalometer.status.latitude = intervalometer.currentProgram.coords.lat;
                        intervalometer.status.longitude = intervalometer.currentProgram.coords.lon;
                        intervalometer.status.altitude = intervalometer.currentProgram.coords.alt;
            
                        var sunmoon = meeus.sunmoon(new Date(), intervalometer.currentProgram.coords.lat, intervalometer.currentProgram.coords.lon, intervalometer.currentProgram.coords.alt);
                        intervalometer.status.sunPos = {
                            azimuth: sunmoon.sunpos.az,
                            altitude: sunmoon.sunpos.alt,
                        }
                        intervalometer.status.moonPos = {
                            azimuth: sunmoon.moonpos.az,
                            altitude: sunmoon.moonpos.alt,
                        }
                    }
                    exp.init(camera.minEv(remap('camera.ptp.settings'), getEvOptions()), camera.maxEv(remap('camera.ptp.settings'), getEvOptions()), program.nightLuminance, program.dayLuminance, program.highlightProtection);
                    intervalometer.status.running = true;
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                    logEvent("program:", "starting", program);

                    //function start() {
                    //    if(camera.ptp.settings.autofocus && camera.ptp.settings.autofocus == "on") {
                    //        log("Intervalometer: disabling autofocus");
                    //        camera.ptp.set("autofocus", "off", checkFocus2);
                    //    } else {
                    //        checkFocus2();
                    //    }
                    //}

                    function start() {
                        intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
                        intervalometer.status.useLiveview = false;
                        var oldDriverUseLiveview = (camera.ptp.model && camera.ptp.model.match(/nikon/i) && 
                                                                        !camera.ptp.model.match(/ Z /i)) && 
                                        (((camera.ptp.settings.afmode && camera.ptp.settings.afmode != "manual" || camera.ptp.model.match(/D850/i))) || 
                                            (camera.ptp.settings.viewfinder && camera.ptp.settings.viewfinder != "off"));
                        var newDriverUseLiveview = (camera.ptp.new.available && camera.ptp.new.model && camera.ptp.new.model.match(/nikon/i) && !camera.ptp.new.model.match(/ Z /i)) && 
                                            (((camera.ptp.new.cameras[0].camera.config.focusMode && camera.ptp.new.cameras[0].camera.config.focusMode.value != "mf" || camera.ptp.new.model.match(/D850/i))) || 
                                                (camera.ptp.new.cameras[0].camera.status.liveview));
                        if(oldDriverUseLiveview || newDriverUseLiveview) {
                            if(oldDriverUseLiveview) {
                                logEvent("Intervalometer: using Nikon liveview for capture (old driver)");
                                camera.ptp.liveview(start2);
                            } else {
                                logEvent("Intervalometer: using Nikon liveview for capture (new driver)");
                                camera.ptp.new.liveviewMode(true, start2);
                            }
                            intervalometer.status.useLiveview = true;
                            //camera.ptp.set("afmode", "manual", start2); // doesn't work because focusmode is read-only on Nikon
                        } else {
                            start2();
                        }
                    }

                    function start2() {
                        if(program.scheduled && autoExposureTarget != null) {
                            //if(scheduled(true)) {
                            //    autoSetExposure(intervalometer.status.exposureReferenceEv, function(err) {
                            //        start3();
                            //    });
                            //} else {
                                start3();
                            //}
                        } else {
                            if(camera.ptp.model && camera.ptp.model.match(/nikon/i) && !camera.ptp.captureInitiated() && intervalometer.currentProgram.intervalMode == 'aux') { // only applies to old driver
                                remap('camera.ptp.capture')({mode:"test"}, start3);
                            } else {
                                start3();
                            }
                        }
                    }

                    function start3() {
                        var cameras = 1, primary = 1;
                        if(camera.ptp.synchronized || (camera.ptp.new.available && camera.ptp.new.cameras.length > 1)) {
                            if(camera.ptp.new.available) {
                                cameras = 1; //camera.ptp.new.cameras.length;
                                primary = 1;
                                try {
                                    camera.ptp.new.setExposure(camera.ptp.new.cameras[0].camera.exposure.shutter.ev, camera.ptp.new.cameras[0].camera.exposure.aperture && camera.ptp.new.cameras[0].camera.exposure.aperture.ev, camera.ptp.new.cameras[0].camera.exposure.iso.ev);
                                } catch(e) {
                                    logErr("sync: error setting exposure:", e);
                                }
                            } else {
                                cameras = camera.ptp.count;
                                primary = camera.ptp.getPrimaryCameraIndex();
                            }
                        }
                        db.setTimelapse(intervalometer.status.tlName, program, cameras, primary, intervalometer.status, function(err, timelapseId) {
                            intervalometer.status.id = timelapseId;
                            processKeyframes(true, function() {
                                setTimeout(function() {
                                    busyPhoto = false;
                                    if(intervalometer.currentProgram.intervalMode != 'aux' || intervalometer.currentProgram.rampMode == 'fixed') {
                                        if(scheduled(true)) {
                                            var delayedMinutes = 0;
                                            function delayed() {
                                                if(program.delay > 5) {
                                                    var minutes = (Math.round(program.delay / 60) - delayedMinutes);
                                                    intervalometer.status.message = "delaying start for " + minutes.toString() + " minute" + (minutes > 1 ? 's' : '') + "...";
                                                    intervalometer.emit("intervalometer.status", intervalometer.status);
                                                }
                                                var delay = 60;
                                                if(program.delay - delayedMinutes * 60 < 60) delay = program.delay - delayedMinutes * 60;
                                                if(delay < 0 || program.scheduled) delay = 0;
                                                delayedMinutes++;
                                                delayHandle = setTimeout(function() {
                                                    if(delayedMinutes * 60 >= program.delay) {
                                                        if(intervalometer.status.exposureReferenceEv != null && (!program.scheduled || autoExposureTarget != null)) {
                                                            autoSetExposure(intervalometer.status.exposureReferenceEv, function(err) {
                                                                if(err) {
                                                                    error("Failed to verify reference exposure after delayed start, will try to continue anyway...");
                                                                    logErr("failed to verify reference exposure after delayed start")
                                                                    runPhoto();
                                                                } else {
                                                                    runPhoto();
                                                                }
                                                            });
                                                        } else {
                                                            runPhoto();
                                                        }
                                                    } else {
                                                        delayed();
                                                    }
                                                }, delay * 1000);

                                            }
                                            if((program.delay > 60 || (program.scheduled && intervalometer.status.exposureReferenceEv == null)) && program.rampMode == 'auto') {
                                                getReferenceExposure(function(err, ev) {
                                                    if(err) {
                                                        intervalometer.cancel('err');
                                                        error(err);
                                                    } else {
                                                        brightWarning(ev);
                                                        intervalometer.status.exposureReferenceEv = ev;
                                                        delayed();
                                                    }
                                                });
                                            } else {
                                                delayed();
                                            }
                                        } else {
                                            if(program.rampMode == 'auto') {
                                                if(intervalometer.status.exposureReferenceEv == null) {
                                                    getReferenceExposure(function(err, ev) {
                                                        if(err) {
                                                            intervalometer.cancel('err');
                                                            error(err);
                                                        } else {
                                                            brightWarning(ev);
                                                            intervalometer.status.exposureReferenceEv = ev;
                                                            if(scheduled()) runPhoto();
                                                        }
                                                    });
                                                } else {
                                                    autoSetExposure(intervalometer.status.exposureReferenceEv, function(err) {
                                                        if(err) {
                                                            error("Failed to verify reference exposure after delayed start, will try to continue anyway...");
                                                        }
                                                        if(scheduled()) runPhoto();
                                                    });
                                                }
                                            } else {
                                                if(scheduled()) runPhoto();
                                            }
                                        }
                                    }
                                    if(intervalometer.currentProgram.intervalMode == 'aux') {
                                        intervalometer.status.message = "waiting for AUX2...";
                                        logEvent("ready and waiting for AUX2...");
                                        intervalometer.emit("intervalometer.status", intervalometer.status);
                                    }
                                }, 3000);
                                callback && callback();
                            });
                        });
                    }

                    if (program.destination && program.destination == 'sd' && camera.ptp.sdPresent) {
                        camera.ptp.mountSd(function(mountErr) {
                            if(mountErr) {
                                logErr("failed to mount SD card");
                                intervalometer.cancel('err');
                                error("Error mounting SD card. \nVerify the SD card is formatted and fully inserted in the VIEW, then try starting the time-lapse again.\nMessage from system: " + mountErr, callback);
                            } else {
                                intervalometer.status.mediaFolder = "/media/" + intervalometer.status.tlName;
                                fs.mkdir(intervalometer.status.mediaFolder, function(folderErr) {
                                    if(folderErr) {
                                        logErr("error creating folder", intervalometer.status.mediaFolder);
                                        intervalometer.cancel('err');
                                        error("Error creating folder on SD card: /" + intervalometer.status.tlName + ".\nVerify the card is present and not write-protected, then try starting the time-lapse again.\nAlternatively, set the Destination to Camera instead (if supported)", callback);
                                    } else {
                                        start();
                                    }
                                });
                            }
                        });
                    } else {
                        start();
                    }

                });
            } else {
                var errorList = "";
                var val = "";
                for(var i = 0; i < validationResults.errors.length; i++) {
                    if(program.hasOwnProperty([validationResults.errors[i].param])) {
                        val = " (" + program[validationResults.errors[i].param] + ")";
                    } else {
                        val = "";
                    }
                    errorList += "- " + validationResults.errors[i].reason + val + "\n";
                }
                intervalometer.cancel('err');
                error("Failed to start time-lapse: \n" + errorList + "Please correct and try again.", callback);
            }
        });
    } else {
        intervalometer.cancel('err');
        error("Camera not connected.  Please verify camera connection via USB and try again.", callback);
    }

}

intervalometer.moveTracking = function(axis, degrees, callback) {
    if(axis == 'Pan') {
        intervalometer.status.panDiffNew += degrees;
    }
    if(axis == 'Tilt') {
        intervalometer.status.tiltDiffNew += degrees;
    }
    callback && callback();
}

intervalometer.moveFocus = function(steps, callback) {
    intervalometer.status.focusDiffNew += steps;
    callback && callback();
}

intervalometer.addGpsData = function(gpsData, callback) {
    intervalometer.gpsData = gpsData;
    callback && callback();
}

function dynamicChangeUpdate() {
    if(intervalometer.status.dynamicChange) {
        var change = false;
        for(param in intervalometer.status.dynamicChange) {
            if(intervalometer.status.dynamicChange.hasOwnProperty(param) && intervalometer.status.dynamicChange[param]) {
                var item = intervalometer.status.dynamicChange[param];
                var newVal = interpolate.linear([{
                    x: item.startFrame,
                    y: item.startVal
                }, {
                    x: item.endFrame,
                    y: item.endVal
                }], intervalometer.status.frames);
                switch(param) {
                    case 'manualOffsetEv':
                        intervalometer.status.exposure.status.rampEv -= newVal - item.lastVal; // this makes for an immediate change without destabilizing the PID loop
                    case 'nightRefEv':
                    case 'dayRefEv':
                        intervalometer.status.exposure.status[param] += newVal - item.lastVal; // this allows the highlight protection to also change it without overwriting
                        break;
                    case 'rampEv':
                        intervalometer.status.rampEv = newVal;
                        break;
                    default:
                        intervalometer.currentProgram[param] = newVal;
                }
                item.lastVal = newVal;
                if(item.endFrame < intervalometer.status.frames) {
                    delete intervalometer.status.dynamicChange[param];
                }
                change = true;
            }
        }
        if(change) {
            intervalometer.emit("intervalometer.status", intervalometer.status);
            intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
        }
    }
}

// changes 'parameter' to 'newValue' across 'frames'
// parameter can be: interval, dayInterval, nightInterval, exposureOffset, mode (immediate)
intervalometer.dynamicChange = function(parameter, newValue, frames, callback) {
    var rampableChange = ['interval', 'dayInterval', 'nightInterval'];
    var specialChange = ['rampMode', 'hdrCount', 'hdrStops', 'intervalMode', 'manualOffsetEv', 'dayRefEv', 'nightRefEv', 'rampEv', 'frames'];

    if(rampableChange.indexOf(parameter) !== -1) {
        frames = parseInt(frames);
        if(!frames || frames < 1) frames = 1;
        log("Intervalometer: LIVE UPDATE:", parameter, "set to", newValue, "across", frames, "frames");
        intervalometer.status.dynamicChange[parameter] = {
            startVal: parseFloat(intervalometer.currentProgram[parameter]),
            lastVal: parseFloat(intervalometer.currentProgram[parameter]),
            endVal: parseFloat(newValue),
            startFrame: intervalometer.status.frames,
            endFrame: intervalometer.status.frames + frames
        };
        callback && callback();
    } else if(specialChange.indexOf(parameter) !== -1) {
        switch(parameter) {
            case 'intervalMode':
                var newInt = intervalometer.status.intervalMs / 1000;
                if(newValue == 'auto' && intervalometer.currentProgram.intervalMode == 'fixed') {
                    intervalometer.currentProgram.dayInterval = newInt;
                    intervalometer.currentProgram.nightInterval = newInt;
                    intervalometer.currentProgram.intervalMode = 'auto';
                    intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
                }
                if(newValue == 'fixed' && intervalometer.currentProgram.intervalMode == 'auto') {
                    intervalometer.currentProgram.frames = Math.ceil(intervalometer.status.frames / 100) * 100 + 500;
                    intervalometer.status.framesRemaining = intervalometer.currentProgram.frames - intervalometer.status.frames;
                    intervalometer.currentProgram.interval = newInt;
                    intervalometer.currentProgram.intervalMode = 'fixed';
                    intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
                }
                intervalometer.emit("intervalometer.status", intervalometer.status);
                break

            case 'rampMode':
                if(newValue == 'auto' && intervalometer.status.rampMode != 'auto') { // restart ramping based on current exposure
                    intervalometer.status.rampMode = 'auto';
                    intervalometer.status.rampEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings'));
                    exp.init(camera.minEv(remap('camera.ptp.settings'), getEvOptions()), camera.maxEv(remap('camera.ptp.settings'), getEvOptions()), intervalometer.currentProgram.nightLuminance, intervalometer.currentProgram.dayLuminance, intervalometer.currentProgram.highlightProtection);
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                }
                if(newValue == 'fixed') {
                    if(intervalometer.status.rampEv == null) intervalometer.status.rampEv = camera.lists.getEvFromSettings(remap('camera.ptp.settings')); 
                    intervalometer.status.rampMode = 'fixed';
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                }
                break;

            case 'manualOffsetEv':
            case 'nightRefEv':
            case 'dayRefEv':
                frames = parseInt(frames);
                if(!frames || frames < 1) frames = 1;
                log("Intervalometer: LIVE UPDATE:", parameter, "set to", newValue, "across", frames, "frames");
                intervalometer.status.dynamicChange[parameter] = {
                    startVal: parseFloat(intervalometer.status.exposure.status[parameter]),
                    lastVal: parseFloat(intervalometer.status.exposure.status[parameter]),
                    endVal: parseFloat(newValue),
                    startFrame: intervalometer.status.frames,
                    endFrame: intervalometer.status.frames + frames
                };
                break;


            case 'rampEv':
                frames = parseInt(frames);
                if(!frames || frames < 1) frames = 1;
                log("Intervalometer: LIVE UPDATE:", parameter, "set to", newValue, "across", frames, "frames");
                intervalometer.status.dynamicChange[parameter] = {
                    startVal: intervalometer.status.rampEv,
                    lastVal: intervalometer.status.rampEv,
                    endVal: intervalometer.status.rampEv + parseFloat(newValue),
                    startFrame: intervalometer.status.frames,
                    endFrame: intervalometer.status.frames + frames
                };
                break;

            case 'frames':
                if(parseInt(newValue) > intervalometer.status.frames) {
                    intervalometer.currentProgram.frames = parseInt(newValue);
                    intervalometer.status.framesRemaining = intervalometer.currentProgram.frames - intervalometer.status.frames;
                    intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
                    intervalometer.emit("intervalometer.status", intervalometer.status);
                } else {
                    callback && callback("frames must be greated than completed frames");
                }
                break;

            case 'hdrCount':
            case 'hdrStops':
                intervalometer.currentProgram[parameter] = newValue;
                planHdr(intervalometer.currentProgram.hdrCount, intervalometer.currentProgram.hdrStops);
                intervalometer.emit("intervalometer.currentProgram", intervalometer.currentProgram);
                break;
        }
        callback && callback();
    } else {
        callback && callback("invalid parameter");
    }
}

intervalometer.updateProgram = function(updates, callback) {
    log("Intervalometer: updateProgram:", updates);
    for(key in updates) {
        if(updates.hasOwnProperty(key)) {
            intervalometer.currentProgram[key] = updates[key];
        }
    }
    callback && callback();
}

intervalometer.setAuxPulseLength = function(lengthMs, callback) {
    auxMotionConfig.lengthMs = lengthMs;
    log("INTERVALOMETER: set aux lengthMs to", auxMotionConfig.lengthMs);
}

intervalometer.setAuxPulseInvert = function(invert, callback) {
    auxMotionConfig.inverted = !!invert;
    motionSyncSetup();
    log("INTERVALOMETER: set aux invert to", auxMotionConfig.inverted);
}

intervalometer.setAuxExternalPad = function(padMs, callback) {
    auxMotionConfig.externalIntervalPaddingMs = padMs;
    log("INTERVALOMETER: set aux externalIntervalPaddingMs to", auxMotionConfig.externalIntervalPaddingMs);
}



module.exports = intervalometer;