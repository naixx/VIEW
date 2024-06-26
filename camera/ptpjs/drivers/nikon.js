
/****************************************************************************
 LICENSE: CC BY-NC-SA 4.0 https://creativecommons.org/licenses/by-nc-sa/4.0/
 This is an original driver by Elijah Parker <mail@timelapseplus.com>
 It is free to use in other projects for non-commercial purposes.  For a
 commercial license and consulting, please contact mail@timelapseplus.com
*****************************************************************************/

var util = require('util');
var async = require('async');
var EventEmitter = require('events').EventEmitter;
var ptp = require('../common/ptp-functions.js');
var fs = require('fs');

var driver = new EventEmitter();

driver.name = "Nikon";

function _logD() {
    if(arguments.length > 0) {
        arguments[0] = "PTP-NIKON: " + arguments[0];
    }
    console.log.apply(console, arguments);
}

function _logE() {
    if(arguments.length > 0) {
        arguments[0] = "PTP-NIKON: " + arguments[0];
    }
    console.log.apply(console, arguments);
}

function exposureEvent(camera) {
    if(!camera._expCache) camera._expCache = {};
    var update = false;
    for(var k in camera.exposure) {
        if(camera.exposure[k].ev != camera._expCache[k]) {
           camera._expCache[k] = camera.exposure[k].ev;
           update = true; 
        }
    }
    if(update) {
        driver.emit('settings', camera);
    }
}

driver.supportsNativeHDR = true;

driver.supportedCameras = {
    '04b0:0420': { name: "Nikon D3x",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0421': { name: "Nikon D90",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0422': { name: "Nikon D700",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0423': { name: "Nikon D5000",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0424': { name: "Nikon D3000",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0425': { name: "Nikon D300s",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0426': { name: "Nikon D3s",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0427': { name: "Nikon D3100",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0428': { name: "Nikon D7000",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0429': { name: "Nikon D5100",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:042a': { name: "Nikon D800",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:042b': { name: "Nikon D4",        status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:042c': { name: "Nikon D3200",     status: 'tested',  supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:042d': { name: "Nikon D600",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:042e': { name: "Nikon D800E",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:042f': { name: "Nikon D5200",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0430': { name: "Nikon D7100",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0431': { name: "Nikon D5300",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0432': { name: "Nikon DF",        status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0433': { name: "Nikon D3300",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0434': { name: "Nikon D610",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0435': { name: "Nikon D4s",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Mini-B' },
    '04b0:0436': { name: "Nikon D810",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:0437': { name: "Nikon D750",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0438': { name: "Nikon D5500",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:0439': { name: "Nikon D7200",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: '8-pin USB' },
    '04b0:043a': { name: "Nikon D5",        status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:043b': { name: "Nikon D810a",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:043c': { name: "Nikon D500",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:043d': { name: "Nikon D3400",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Micro-B' },
    '04b0:043f': { name: "Nikon D5600",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Micro-B' },
    '04b0:0440': { name: "Nikon D7500",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'Micro-B' },
    '04b0:0441': { name: "Nikon D850",      status: 'tested',  supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB 3' },
    '04b0:0442': { name: "Nikon Z 7",       status: 'tested',  supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0443': { name: "Nikon Z 6",       status: 'tested',  supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0444': { name: "Nikon Z 50",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0445': { name: "Nikon D3500",     status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0446': { name: "Nikon D780",      status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0448': { name: "Nikon Z 5",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:044b': { name: "Nikon Z 7 II",    status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:044c': { name: "Nikon Z 6 II",    status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
    '04b0:0450': { name: "Nikon Z 9",       status: 'unknown', supports: { shutter: true, aperture: true, iso: true, liveview: true, destination: true, focus: true, }, usb: 'USB C' },
}

var properties = {
    'shutter': {
        name: 'shutter',
        category: 'exposure',
        setFunction: ptp.setPropU32,
        getFunction: ptp.getPropU32,
        listFunction: ptp.listProp,
        code: 0x500D,
        ev: true,
        values: [
            { name: "bulb",    ev: null,        code:  4294967295 },
            { name: "---",     ev: null,        code:  4294967293 },
            { name: "30s",     ev: -11,         code:  300000 },
            { name: "25s",     ev: -10 - 2 / 3, code:  250000 },
            { name: "20s",     ev: -10 - 1 / 3, code:  200000 },
            { name: "15s",     ev: -10,         code:  150000 },
            { name: "13s",     ev: -9 - 2 / 3,  code:  130000 },
            { name: "10s",     ev: -9 - 1 / 3,  code:  100000 },
            { name: "8s",      ev: -9,          code:  80000 },
            { name: "6s",      ev: -8 - 2 / 3,  code:  60000 },
            { name: "5s",      ev: -8 - 1 / 3,  code:  50000 },
            { name: "4s",      ev: -8,          code:  40000 },
            { name: "3s",      ev: -7 - 2 / 3,  code:  30000 },
            { name: "2.5s",    ev: -7 - 1 / 3,  code:  25000 },
            { name: "2s",      ev: -7,          code:  20000 },
            { name: "1.6s",    ev: -6 - 2 / 3,  code:  16000 },
            { name: "1.3s",    ev: -6 - 1 / 3,  code:  13000 },
            { name: "1s",      ev: -6,          code:  10000 },
            { name: "0.8s",    ev: -5 - 2 / 3,  code:  7692 },
            { name: "0.6s",    ev: -5 - 1 / 3,  code:  6250 },
            { name: "1/2",     ev: -5,          code:  5000 },
            { name: "0.4s",    ev: -4 - 2 / 3,  code:  4000 },
            { name: "1/3",     ev: -4 - 1 / 3,  code:  3333 },
            { name: "1/4",     ev: -4,          code:  2500 },
            { name: "1/5",     ev: -3 - 2 / 3,  code:  2000 },
            { name: "1/6",     ev: -3 - 1 / 3,  code:  1666 },
            { name: "1/8",     ev: -3,          code:  1250 },
            { name: "1/10",    ev: -2 - 2 / 3,  code:  1000 },
            { name: "1/13",    ev: -2 - 1 / 3,  code:  769 },
            { name: "1/15",    ev: -2,          code:  666 },
            { name: "1/20",    ev: -1 - 2 / 3,  code:  500 },
            { name: "1/25",    ev: -1 - 1 / 3,  code:  400 },
            { name: "1/30",    ev: -1,          code:  333 },
            { name: "1/40",    ev: 0 - 2 / 3,   code:  250 },
            { name: "1/50",    ev: 0 - 1 / 3,   code:  200 },
            { name: "1/60",    ev: 0,           code:  166 },
            { name: "1/80",    ev: 0 + 1 / 3,   code:  125 },
            { name: "1/100",   ev: 0 + 2 / 3,   code:  100 },
            { name: "1/125",   ev: 1,           code:  80 },
            { name: "1/160",   ev: 1 + 1 / 3,   code:  62 },
            { name: "1/200",   ev: 1 + 2 / 3,   code:  50 },
            { name: "1/250",   ev: 2,           code:  40 },
            { name: "1/320",   ev: 2 + 1 / 3,   code:  31 },
            { name: "1/400",   ev: 2 + 2 / 3,   code:  25 },
            { name: "1/500",   ev: 3,           code:  20 },
            { name: "1/640",   ev: 3 + 1 / 3,   code:  15 },
            { name: "1/800",   ev: 3 + 2 / 3,   code:  12 },
            { name: "1/1000",  ev: 4,           code:  10 },
            { name: "1/1250",  ev: 4 + 1 / 3,   code:  8 },
            { name: "1/1600",  ev: 4 + 2 / 3,   code:  6 },
            { name: "1/2000",  ev: 5,           code:  5 },
            { name: "1/2500",  ev: 5 + 1 / 3,   code:  4 },
            { name: "1/3200",  ev: 5 + 2 / 3,   code:  3 },
            { name: "1/4000",  ev: 6,           code:  2 },
            { name: "1/8000",  ev: 7,           code:  1 },
        ]
    },
    'aperture': {
        name: 'aperture',
        category: 'exposure',
        setFunction: ptp.setPropU16,
        getFunction: ptp.getPropU16,
        listFunction: ptp.listProp,
        code: 0x5007,
        ev: true,
        values: [
            { name: "1.0",      ev: -8,          code: 100  },
            { name: "1.1",      ev: -7 - 2 / 3,  code: 110  },
            { name: "1.2",      ev: -7 - 1 / 3,  code: 120  },
            { name: "1.4",      ev: -7,          code: 140  },
            { name: "1.6",      ev: -6 - 2 / 3,  code: 160  },
            { name: "1.8",      ev: -6 - 1 / 3,  code: 180  },
            { name: "2.0",      ev: -6,          code: 200  },
            { name: "2.2",      ev: -5 - 2 / 3,  code: 220  },
            { name: "2.5",      ev: -5 - 1 / 3,  code: 250  },
            { name: "2.8",      ev: -5,          code: 280  },
            { name: "3.2",      ev: -4 - 2 / 3,  code: 320  },
            { name: "3.5",      ev: -4 - 1 / 3,  code: 350  },
            { name: "3.6",      ev: -4 - 1 / 3,  code: 360  },
            { name: "4.0",      ev: -4,          code: 400  },
            { name: "4.5",      ev: -3 - 2 / 3,  code: 450  },
            { name: "5.0",      ev: -3 - 1 / 3,  code: 500  },
            { name: "5.6",      ev: -3,          code: 560  },
            { name: "6.3",      ev: -2 - 2 / 3,  code: 630  },
            { name: "6.3",      ev: -2 - 2 / 3,  code: 640  },
            { name: "7.1",      ev: -2 - 1 / 3,  code: 710  },
            { name: "8",        ev: -2,          code: 800  },
            { name: "9",        ev: -1 - 2 / 3,  code: 900  },
            { name: "10",       ev: -1 - 1 / 3,  code: 1000  },
            { name: "11",       ev: -1,          code: 1100  },
            { name: "13",       ev: -0 - 2 / 3,  code: 1300  },
            { name: "14",       ev: -0 - 1 / 3,  code: 1400  },
            { name: "16",       ev:  0,          code: 1600  },
            { name: "18",       ev:  0 + 1 / 3,  code: 1800  },
            { name: "20",       ev:  0 + 2 / 3,  code: 2000  },
            { name: "22",       ev:  1,          code: 2200  },
            { name: "25",       ev:  2 + 1 / 3,  code: 2500  },
            { name: "29",       ev:  2 + 2 / 3,  code: 2900  },
            { name: "32",       ev:  3,          code: 3200  },
            { name: "36",       ev:  3 + 1 / 3,  code: 3600  },
            { name: "42",       ev:  3 + 2 / 3,  code: 4200  },
            { name: "45",       ev:  4,          code: 4500  },
            { name: "50",       ev:  4 + 1 / 3,  code: 5000  },
            { name: "57",       ev:  4 + 2 / 3,  code: 5700  },
            { name: "64",       ev:  5,          code: 6400  }
        ]
    },
    'iso': {
        name: 'iso',
        category: 'exposure',
        setFunction: ptp.setProp16,
        getFunction: ptp.getProp16,
        listFunction: ptp.listProp,
        code: 0x500F,
        ev: true,
        values: [
            { name: "32",       ev:  1 + 2 / 3,  code: 32 },
            { name: "40",       ev:  1 + 1 / 3,  code: 40 },
            { name: "50",       ev:  1,          code: 50 },
            { name: "64",       ev:  0 + 2 / 3,  code: 64 },
            { name: "80",       ev:  0 + 1 / 3,  code: 80 },
            { name: "100",      ev:  0,          code: 100 },
            { name: "125",      ev: -0 - 1 / 3,  code: 125 },
            { name: "160",      ev: -0 - 2 / 3,  code: 160 },
            { name: "200",      ev: -1,          code: 200 },
            { name: "250",      ev: -1 - 1 / 3,  code: 250 },
            { name: "320",      ev: -1 - 2 / 3,  code: 320 },
            { name: "400",      ev: -2,          code: 400 },
            { name: "500",      ev: -2 - 1 / 3,  code: 500 },
            { name: "640",      ev: -2 - 2 / 3,  code: 640 },
            { name: "800",      ev: -3,          code: 800 },
            { name: "1000",     ev: -3 - 1 / 3,  code: 1000 },
            { name: "1250",     ev: -3 - 2 / 3,  code: 1250 },
            { name: "1600",     ev: -4,          code: 1600 },
            { name: "2000",     ev: -4 - 1 / 3,  code: 2000 },
            { name: "2500",     ev: -4 - 2 / 3,  code: 2500 },
            { name: "3200",     ev: -5,          code: 3200 },
            { name: "4000",     ev: -5 - 1 / 3,  code: 4000 },
            { name: "5000",     ev: -5 - 2 / 3,  code: 5000 },
            { name: "6400",     ev: -6,          code: 6400 },
            { name: "8000",     ev: -6 - 1 / 3,  code: 8000 },
            { name: "10000",    ev: -6 - 2 / 3,  code: 10000 },
            { name: "12800",    ev: -7,          code: 12800 },
            { name: "16000",    ev: -7 - 1 / 3,  code: 16000 },
            { name: "20000",    ev: -7 - 2 / 3,  code: 20000 },
            { name: "25600",    ev: -8,          code: 25600 },
            { name: "32000",    ev: -8 - 1 / 3,  code: 32000 },
            { name: "40000",    ev: -8 - 2 / 3,  code: 40000 },
            { name: "51200",    ev: -9,          code: 51200 },
            { name: "64000",    ev: -9 - 1 / 3,  code: 64000 },
            //{ name: "80000",    ev: -9 - 2 / 3,  code: 80000 },
            //{ name: "102400",   ev: -10,         code: 102400 },
            //{ name: "128000",   ev: -10 - 1 / 3, code: 128000 },
            //{ name: "160000",   ev: -10 - 2 / 3, code: 160000 },
            //{ name: "204800",   ev: -11,         code: 204800 },
        ]
    },
    'format': {
        name: 'format',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0x5004,
        filter: {
            by: 'type',
            fn: function(values) { return (values && values.length > 8) ? 1 : 0; }
        },
        ev: false,
        values: [
            { name: "RAW",               value: 'raw',      code: 4 , type: 0 },
            { name: "JPEG Normal",       value: 'jpeg',     code: 1 , type: 0 },
            { name: "JPEG Fine",         value: 'jpeg',     code: 2 , type: 0 },
            { name: "JPEG Basic",        value: 'jpeg',     code: 0 , type: 0 },
            { name: "RAW + JPEG Fine",   value: 'raw+jpeg', code: 7 , type: 0 },

            { name: "JPEG Basic",        value: 'jpeg',     code: 0 , type: 1 },
            { name: "JPEG Basic*",       value: 'jpeg',     code: 1 , type: 1 },
            { name: "JPEG Normal",       value: 'jpeg',     code: 2 , type: 1 },
            { name: "JPEG Normal*",      value: 'jpeg',     code: 3 , type: 1 },
            { name: "JPEG Fine",         value: 'jpeg',     code: 4 , type: 1 },
            { name: "JPEG Fine*",        value: 'jpeg',     code: 5 , type: 1 },
            { name: "TIFF",              value: 'tiff',     code: 6 , type: 1 },
            { name: "RAW",               value: 'raw',      code: 7 , type: 1 },
            { name: "RAW + JPEG Basic",  value: 'raw+jpeg', code: 8 , type: 1 },
            { name: "RAW + JPEG Basic*", value: 'raw+jpeg', code: 9 , type: 1 },
            { name: "RAW + JPEG Norm",   value: 'raw+jpeg', code: 10, type: 1 },
            { name: "RAW + JPEG Norm*",  value: 'raw+jpeg', code: 11, type: 1 },
            { name: "RAW + JPEG Fine",   value: 'raw+jpeg', code: 12, type: 1 },
            { name: "RAW + JPEG Fine*",  value: 'raw+jpeg', code: 13, type: 1 },
        ]
    },
    'destination': {
        name: 'destination',
        category: 'config',
        setFunction: null,
        getFunction: null,
        listFunction: null,
        code: null,
        ev: false,
        default: 0,
        values: [
            { name: "camera",            code: 0  },
            { name: "VIEW",              code: 1  },
        ]
    },
    'focusPos': {
        name: 'focusPos',
        category: 'status',
        setFunction: null,
        getFunction: null,
        listFunction: null,
        code: null,
        ev: false,
        default: 0,
    },
    'battery': {
        name: 'battery',
        category: 'status',
        setFunction: null,
        getFunction: ptp.getPropU8,
        listFunction: null,
        code: 0x5001,
        ev: false,
    },
    'burst': {
        name: 'burst',
        category: 'config',
        setFunction: ptp.setPropU16,
        getFunction: ptp.getPropU16,
        listFunction: null,
        code: 0x5018,
        ev: false,
    },
    'bracketing': {
        name: 'bracketing',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD0C0,
        ev: false,
        values: [
            { name: "disabled",  value: 0, code: 0 },
            { name: "enabled",   value: 1, code: 1 },
        ]
    },
    'bracketingStops': {
        name: 'bracketingStops',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD0C1,
        ev: false,
        values: [
            { name: "1/3 stop",  value: 1/3, code: 0 },
            { name: "2/3 stop",  value: 2/3, code: 1 },
            { name: "1 stop",    value: 1,   code: 2 },
            { name: "2 stop",    value: 2,   code: 3 },
            { name: "3 stop",    value: 3,   code: 4 },
        ]
    },
    'bracketingProgram': {
        name: 'bracketingProgram',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD0C2,
        ev: false,
        values: [
            { name: "2, minus side",  value: -2,   code: 0 },
            { name: "2, plus side",   value: 2,    code: 1 },
            { name: "3, minus side",  value: -3,   code: 2 },
            { name: "3, plus side",   value: null, code: 3 },
            { name: "3, both sides",  value: 3,    code: 4 },
            { name: "5, both sides",  value: 5,    code: 5 },
            { name: "7, both sides",  value: 7,    code: 6 },
            { name: "9, both sides",  value: 9,    code: 7 },
        ]
    },
    //'bracketingCount': {
    //    name: 'bracketingCount',
    //    category: 'config',
    //    setFunction: ptp.setPropU8,
    //    getFunction: ptp.getPropU8,
    //    listFunction: ptp.listProp,
    //    code: 0xD0C3,
    //    ev: false,
    //    values: [
    //        { name: "UNKNOWN",  value: 0, code: 1 },
    //    ]
    //},
    'bracketingOrder': {
        name: 'bracketingOrder',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD07A,
        ev: false,
        values: [
            { name: "Center first",  value: 'center', code: 0 },
            { name: "Under first",   value: 'under',  code: 1 },
        ]
    },
    'bracketingParams': {
        name: 'bracketingParams',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD079,
        ev: false,
        values: [
            { name: "Shutter",            value: 's',   code: 0 },
            { name: "Shutter/Aperture",   value: 's+a', code: 1 },
            { name: "Aperture",           value: 'a',   code: 2 },
            { name: "Flash only",         value: 'f',   code: 3 },
        ]
    },
    'bracketingMode': {
        name: 'bracketingMode',
        category: 'config',
        setFunction: ptp.setPropU8,
        getFunction: ptp.getPropU8,
        listFunction: ptp.listProp,
        code: 0xD078,
        ev: false,
        values: [
            { name: "AE & Flash",         value: 'flash',   code: 0 },
            { name: "AE only",            value: 'default', code: 1 },
            { name: "Flash only",         value: null,      code: 2 },
            { name: "ADL Bracketing",     value: null,      code: 3 },
        ]
    },
    'focusMode': {
        name: 'focusMode',
        category: 'config',
        setFunction: ptp.setPropU16,
        getFunction: ptp.getPropU16,
        listFunction: ptp.listProp,
        code: 0x500A,
        ev: false,
        values: [
            { name: "MF",         value: 'mf',       code: 0x0001 },
            { name: "AF",         value: 'af',       code: 0x0002 },
            { name: "AF Macro",   value: null,       code: 0x0003 },
            { name: "AF-S",       value: null,       code: 0x8010 },
            { name: "AF-C",       value: null,       code: 0x8011 },
            { name: "AF-A",       value: null,       code: 0x8012 },
        ]
    },
}

driver.properties = properties;

function propMapped(propCode) {
    for(var name in properties) {
        if(properties.hasOwnProperty(name)) {
            if(propCode === properties[name].code) return true;
        }
    }
    return false;
}

driver._error = function(camera, error) { // events received
    _logE(error);
};

driver._event = function(camera, data) { // events received
    if(!camera._eventData) {
        camera._eventData = data;
    } else {
        camera._eventData = Buffer.concat([camera._eventData, data]);
    }
    if(camera._eventData.length < 12) return;
    ptp.parseEvent(camera._eventData, function(type, event, param1, param2, param3) {
        camera._eventData = null;
        if(event == ptp.PTP_EC_ObjectAdded) {
            _logD("object added:", ptp.hex(param1));
            camera._objectsAdded.push(param1);
        } else if(event == ptp.PTP_EC_DevicePropChanged) {
            var check = function() {
                if(camera._eventTimer) clearTimeout(camera._eventTimer);            
                camera._eventTimer = setTimeout(function() {
                    camera._eventTimer = null;
                    if(!camera._blockEvents) {
                        driver.refresh(camera);
                    } else {
                        camera._eventTimer = setTimeout(check, 500);
                    }
                }, 500);
            }
            if(propMapped(param1)) {
                _logD("property changed:", ptp.hex(param1), "(mapped)");
                check();
            } else {
                _logD("property changed:", ptp.hex(param1), "(not mapped)");
            }
        } else {
            _logD("EVENT:", data);
        }
    });
};

driver.refresh = function(camera, callback) {
    var keys = [];
    for(var key in properties) {
        keys.push(key);
    }
    async.series([
        function(cb){
            var fetchNextProperty = function() {
                var key = keys.pop();
                if(key) {
                    if(!camera[properties[key].category]) camera[properties[key].category] = {};
                    if(!camera[properties[key].category][key]) camera[properties[key].category][key] = {};
                    if(properties[key].listFunction) {
                        properties[key].listFunction(camera._dev, properties[key].code, function(err, current, list, type, listType) {
                            if(err || !list) {
                                _logE("failed to list", key, ", err:", err);
                            } else {
                                var propertyListValues = properties[key].values;
                                if(properties[key].filter) {
                                    var val = properties[key].filter.fn(list);
                                    propertyListValues = propertyListValues.filter(function(item) {
                                        return item[properties[key].filter.by] == val;
                                    });
                                }
                                _logD(key, "type is", type, "listType", listType);
                                if(listType == 1 && list.length == 3) { // convert range to list
                                    _logD(key, "list", list);
                                    var newList = [];
                                    for(var val = list[0]; val <= list[1]; val += list[2]) newList.push(val);
                                    list = newList;
                                }
                                var currentMapped = mapPropertyItem(current, propertyListValues);
                                if(!currentMapped) {
                                    _logE(key, "item not found:", current);
                                    currentMapped = {
                                        name: "UNKNOWN",
                                        ev: null,
                                        value: null,
                                        code: current
                                    }
                                }
                                _logD(key, "=", currentMapped.name);
                                camera[properties[key].category][key] = ptp.objCopy(currentMapped, {});
                                var mappedList = [];
                                for(var i = 0; i < list.length; i++) {
                                    var mappedItem = mapPropertyItem(list[i], propertyListValues);
                                    if(!mappedItem) {
                                        _logE(key, "list item not found:", list[i]);
                                    } else {
                                        mappedList.push(mappedItem);
                                    }
                                }
                                camera[properties[key].category][key].list = mappedList;
                            }
                            fetchNextProperty();
                        });
                    } else if(properties[key].getFunction) {
                        driver.get(camera, key, function(err, val){
                            _logD(key, "=", val);
                            fetchNextProperty();
                        });
                    } else {
                        if(properties[key].default != null) {
                            if(properties[key].values) {
                                if(!camera[properties[key].category][key]) {
                                    var currentMapped = mapPropertyItem(properties[key].default, properties[key].values);
                                    camera[properties[key].category][key] = ptp.objCopy(currentMapped, {});
                                    var mappedList = [];
                                    for(var i = 0; i < properties[key].values.length; i++) {
                                        mappedList.push(properties[key].values[i]);
                                    }
                                    camera[properties[key].category][key].list = mappedList;
                                }
                            } else {
                                camera[properties[key].category][key] = properties[key].default;
                            }
                        }
                        fetchNextProperty();
                    }
                } else {
                    //console.log(camera.exposure);
                    cb();
                    exposureEvent(camera);
                }
            }
            fetchNextProperty();
        }
    ], function(err) {
        return callback && callback(err);
    });
}

driver.init = function(camera, callback, _tries) {
    camera.supportsNativeHDR = driver.supportsNativeHDR;
    camera._objectsAdded = [];
    if(!_tries) _tries = 0;
    ptp.init(camera._dev, function(err, di) {
        if(err) {
            _logE("init error:", err);
            if(_tries < 5) {
                _tries++;
                setTimeout(function(){
                    driver.init(camera, callback, _tries);
                }, 500);
            } else {
                callback && callback(err);
            }
        } else {
            async.series([
                function(cb){driver.refresh(camera, cb);}  // get settings
            ], function(err) {
                callback && callback(err);
            });
        }
    });
}

function mapPropertyItem(cameraValue, list) {
    if(list == null) return cameraValue;
    for(var i = 0; i < list.length; i++) {
        if(cameraValue == list[i].code) return list[i];
    }
    return null;
}
function equalEv(ev1, ev2) {
    if(ev1 == null || ev2 == null) {
        return ev1 == ev2;
    }
    return Math.abs(ev1 - ev2) < 0.15;
}
driver.set = function(camera, param, value, callback) {
    async.series([
        function(cb){
            var cameraValue = null;
            if(properties[param].values) {
                if(properties[param].ev && typeof value == "number") {
                    for(var i = 0; i < properties[param].values.length; i++) {
                        if(equalEv(properties[param].values[i].ev, value)) {
                            cameraValue = properties[param].values[i].code;
                            break;
                        }
                    }
                } else {
                    for(var i = 0; i < properties[param].values.length; i++) {
                        if(properties[param].values[i].name == value || properties[param].values[i].value == value) {
                            cameraValue = properties[param].values[i].code;
                            break;
                        }
                    }
                }
            } else {
                cameraValue = value;            
            }
            if(properties[param] && properties[param].setFunction) {
                if(cameraValue !== null) {
                    _logD("setting", ptp.hex(properties[param].code), "to", cameraValue);
                    properties[param].setFunction(camera._dev, properties[param].code, cameraValue, function(err) {
                        if(!err) {
                            var newItem =  mapPropertyItem(cameraValue, properties[param].values);
                            for(var k in newItem) {
                                if(newItem.hasOwnProperty(k)) camera[properties[param].category][param][k] = newItem[k];
                            }
                            cb(err);
                            exposureEvent(camera);
                        } else {
                            _logE("error setting " + ptp.hex(properties[param].code) + ": " + err);
                            return cb(err);
                        }
                    });
                } else {
                    _logE("set: unknown value", value, "for", param);
                    return cb("unknown value");
                }
            } else if(properties[param] && properties[param].default != null) {
                if(properties[param].values) {
                    var newItem =  mapPropertyItem(cameraValue, properties[param].values);
                    for(var k in newItem) {
                        if(newItem.hasOwnProperty(k)) camera[properties[param].category][param][k] = newItem[k];
                    }
                } else {
                    camera[properties[param].category][param][k] = cameraValue;
                }
                cb();
                exposureEvent(camera);
            } else {
                _logE("set: unknown param", param);
                return cb("unknown param");
            }
        },
    ], function(err) {
        if(!properties[param].ev) {
            driver.refresh(camera, callback);
        } else {
            return callback && callback(err);
        }
    });
}

driver.get = function(camera, param, callback) {
    async.series([
        function(cb){
            if(properties[param] && properties[param].getFunction) {
                properties[param].getFunction(camera._dev, properties[param].code, function(err, data) {
                    if(!err) {
                        if(properties[param].values) {
                            var newItem =  mapPropertyItem(data, properties[param].values);
                            if(newItem) {
                                for(var k in newItem) {
                                    if(newItem.hasOwnProperty(k)) camera[properties[param].category][param][k] = newItem[k];
                                }
                            } else {
                                var list = camera[properties[param].category][param].list;
                                camera[properties[param].category][param] = {
                                    list: list
                                }
                            }
                        } else {
                            camera[properties[param].category][param] = data;                   
                        }
                        return cb(err);
                    } else {
                        return cb(err);
                    }
                });
            } else {
                if(properties[param] && properties[param].default) {
                    return cb();
                } else {
                    return cb("unknown param");
                }
            }
        },
    ], function(err) {
        return callback && callback(err, camera[properties[param].category][param]);
    });
}

function getImage(camera, timeout, callback) {

    var results = {
        thumb: null,
        filename: null,
        indexNumber: null,
        rawImage: null
    }

    var startTime = Date.now();

    camera._objectsAdded = []; // clear queue

    var check = function() {
        if(Date.now() - startTime > timeout) {
            return callback && callback("timeout", results);
        }
        if(camera.thumbnail) { // saved to camera
            if(camera._objectsAdded.length == 0) {
                return setTimeout(check, 50);
            }
        }
        checkReady(camera, function(err, ready) { // wait if busy
            //console.log("data:", data);
            if(!err && ready) {
                var objectId = camera._objectsAdded.shift();
                if(!camera.thumbnail && !objectId) { // saving to ram
                    return ptp.transaction(camera._dev, 0x941C, [], null, function(err, responseCode, data) {
                        if(!err && responseCode == 0x2001 && data && data.length > 4) {
                            var dataIndex = 0;
                            var eventCount = data.readUInt32LE(dataIndex);
                            dataIndex += 4;
                            var eventCode = null;
                            _logD("data:", data);
                            for(var i = 0; i < eventCount; i++) {
                                if(data.length < dataIndex + 8) return setTimeout(check);
                                eventCode = data.readUInt16LE(dataIndex);
                                dataIndex += 2;
                                var eventParamsCount = data.readUInt16LE(dataIndex);
                                dataIndex += 2;
                                if(eventCode == 0xC101) {
                                    var newObject = data.readUInt32LE(dataIndex);
                                    _logD("new object:", ptp.hex(newObject), "data:", data);
                                    camera._objectsAdded.push(newObject);
                                    return setTimeout(check);
                                }
                                dataIndex += eventParamsCount * 4;
                            }
                        } else {
                            return ptp.transaction(camera._dev, 0x90C7, [], null, function(err, responseCode, data) {
                                if(!err && responseCode == 0x2001 && data && data.length > 4) {
                                    var dataIndex = 0;
                                    var eventCount = data.readUInt16LE(dataIndex);
                                    dataIndex += 2;
                                    var eventCode = null;
                                    _logD("data:", data);
                                    for(var i = 0; i < eventCount; i++) {
                                    if(data.length < dataIndex + 6) return setTimeout(check);
                                        eventCode = data.readUInt16LE(dataIndex);
                                        dataIndex += 2;
                                        //_logD("event code:", eventCode)
                                        if(eventCode == 0xC101) {
                                            var newObject = data.readUInt32LE(dataIndex);
                                            _logD("new object:", ptp.hex(newObject), "data:", data);
                                            camera._objectsAdded.push(newObject);
                                            return setTimeout(check);
                                        }
                                        dataIndex += 4;
                                    }
                                }
                                return setTimeout(check, 50);
                            });
                        }
                        return setTimeout(check, 50);
                    });
                }
                ptp.getObjectInfo(camera._dev, objectId, function(err, oi) {
                    //console.log(oi);
                    if(oi.objectFormat == ptp.PTP_OFC_Association) return setTimeout(check, 50); // folder added, keep waiting for image
                    var image = null;
                    results.filename = oi.filename;
                    results.indexNumber = objectId;
                    if(camera.thumbnail) {
                        ptp.getThumb(camera._dev, objectId, function(err, jpeg) {
                            results.thumb = jpeg;
                            if(camera.config.destination.name == 'VIEW') {
                                ptp.deleteObject(camera._dev, objectId, function() {
                                    callback && callback(err, results);
                                });
                            } else {
                                callback && callback(err, results);
                            }
                        });
                    } else {
                        ptp.getObject(camera._dev, objectId, function(err, image) {
                            results.thumb = ptp.extractJpeg(image);
                            results.rawImage = image;
                            if(camera.config.destination.name == 'VIEW') {
                                ptp.deleteObject(camera._dev, objectId, function() {
                                    callback && callback(err, results);
                                });
                            } else {
                                callback && callback(err, results);
                            }
                        });
                    }
                });
            } else {
                setTimeout(check, 50);
            }
        });
    }
    check();
}

function checkReady(camera, callback) {
    ptp.transaction(camera._dev, 0x90C8, [], null, function(err, responseCode) {
        if(err || (responseCode != 0x2001 && responseCode != 0x2019)) return callback && callback(err || responseCode);
        return callback && callback(null, responseCode == 0x2001);
    });
}

function waitReady(camera, timeout, callback) {
    var startTime = Date.now();
    var check = function() {
        if(Date.now() - startTime > timeout) {
            return callback && callback("timeout");
        }
        checkReady(camera, function(err, ready) { // wait if busy
            //console.log("data:", data);
            if(ready) {
                return callback && callback();
            } else if(err) {
                return callback && callback(err);
            } else {
                setTimeout(check, 50);
            }
        });
    }
    check();
}

driver.capture = function(camera, target, options, callback, noImage, noChangeBracketing, tries) {
    var targetValue = (!target || target == "camera") ? "camera" : "VIEW";
    camera.thumbnail = targetValue == 'camera';
    var results = {};
    async.series([
        function(cb){ // disable bracketing 
            if(!noChangeBracketing && camera.config.bracketing && camera.config.bracketing.value) driver.set(camera, "bracketing", 0, cb); else cb();
        },
        function(cb){ // set burst to 1 
            if(!noChangeBracketing && camera.config.burst > 1) driver.set(camera, "burst", 1, cb); else cb();
        },
        function(cb){ // set destination
            if(camera.config.destination.name == targetValue) cb(); else driver.set(camera, "destination", targetValue, cb);
        },
        function(cb){ // wait for ready
            var check = function() {
                checkReady(camera, function(err, ready) {
                    if(err) return cb(err);
                    if(ready) return cb();
                    setTimeout(check, 50);
                });
            }
            check();
        },
        function(cb){ // trigger capture
            ptp.transaction(camera._dev, 0x9207, [0xffffffff, camera.config.destination.code || 0], null, function(err, responseCode) {
                if(err) {
                    return cb(err);
                } else if(responseCode != 0x2001) {
                    return cb(responseCode);
                } else {
                    return cb();
                }
            });
        },
        function(cb){ // retrieve captured image
            getImage(camera, 60000, function(err, imageResults) {
                results = imageResults;
                cb(err);
            });
        },
    ], function(err, res) {
        if(err) _logE("capture error", ptp.hex(err), "at item", res.length);
        if(err == 0x2019 && tries < 3) {
            return driver.capture(camera, target, options, callback, noImage, noChangeBracketing, tries + 1);
        }
        if(err == ptp.PTP_RC_StoreFull || err == ptp.PTP_RC_StoreNotAvailable) {
            err = "camera card full or unavailable";
        } 
        if(err == ptp.PTP_RC_StoreReadOnly) {
            err = "camera card is read-only";
        } 
        callback && callback(err, results.thumb, results.filename, results.rawImage);
    });
}

/*
    enableBracketing = 0xD0C0 (8-bit, 1=enabled, 0=disabled)
    

*/
driver.captureHDR = function(camera, target, options, frames, stops, darkerOnly, callback, tries) {
    if(target != 'camera') return callback && callback("save to VIEW HDR not supported, set destination to camera instead");

    var targetValue = "camera";
    camera.thumbnail = true;
    var results = {};

    async.series([ // try to setup native
        function(cb){ // enable bracketing
            if(!camera.config.bracketing) return cb("not supported");
            if(!camera.config.bracketing.value) driver.set(camera, "bracketing", 1, cb); else cb();
        },
        function(cb){ // set mode to default
            if(camera.config.bracketingMode && camera.config.bracketingMode.value != 'default') driver.set(camera, "bracketingMode", 'default', cb); else cb();
        },
        function(cb){ // set params to shutter only
            if(camera.config.bracketingParams && camera.config.bracketingParams.value != 's') driver.set(camera, "bracketingParams", 's', cb); else cb();
        },
        function(cb){ // set bracketing stops
            if(camera.config.bracketingStops)  {
                if(Math.round(camera.config.bracketingStops.value * 3) == Math.round(stops * 3)) return cb();
                for(var i = 0; i < camera.config.bracketingStops.list.length; i++) {
                    if(Math.round(camera.config.bracketingStops.list[i].value * 3) == Math.round(stops * 3)) {
                        return driver.set(camera, "bracketingStops", camera.config.bracketingStops.list[i].name, cb);
                    }
                }
                cb && cb("unsupported configuration");
            } else {
                cb && cb("not supported");
            }
        },
        function(cb){ // set bracketing frames / program
            if(camera.config.bracketingProgram)  {
                var bracketingFrames = frames * (darkerOnly ? -1 : 1);
                if(camera.config.bracketingProgram.value == bracketingFrames) return cb();
                for(var i = 0; i < camera.config.bracketingProgram.list.length; i++) {
                    console.log("comparing bracketingFrames", camera.config.bracketingProgram.list[i].value, "==", bracketingFrames);
                    if(camera.config.bracketingProgram.list[i].value == bracketingFrames) {
                        return driver.set(camera, "bracketingProgram", camera.config.bracketingProgram.list[i].value, cb);
                    }
                }
                cb && cb("unsupported configuration");
            } else {
                cb && cb("not supported");
            }
        },
        function(cb){ // set burst
            if(camera.config.burst != frames) driver.set(camera, "burst", frames, cb); else cb();
        },
    ], function(err, res) {
        if(err) _logE("HDR native setup error", ptp.hex(err), "at item", res.length);
        if(err == 0x2019 && tries < 3) {
            return driver.captureHDR(camera, target, options, frames, stops, darkerOnly, callback, tries + 1);
        }
        if(err == "not supported" || err == "unsupported configuration") {
            callback && callback(err); // fixme -- should manually run HDR
        } else if(err) {            
            callback && callback(err);
        } else { // native setup worked, trigger capture
            driver.capture(camera, 'camera', options, callback, false, true);
        }
    });
}

driver.liveviewMode = function(camera, enable, callback, _tries) {
    if(!_tries) _tries = 0;
    if(camera._dev._lvTimer) clearTimeout(camera._dev._lvTimer);
    //if(enable) {
    //    camera._dev._lvTimer = setTimeout(function(){
    //        driver.liveviewMode(camera, false);
    //    }, 60000*10);
    //}
    if(camera.status.liveview != !!enable) {
        if(enable) {
            ptp.transaction(camera._dev, 0x9201, [], null, function(err, responseCode) {
                if(responseCode == 0x2019) {
                    _tries++;
                    if(_tries < 15) {
                        return setTimeout(function(){
                            driver.liveviewMode(camera, enable, callback, _tries);
                        }, 50);
                    }
                }
                if(err || responseCode != 0x2001) {
                    _logD("error enabling liveview:", err, "code:", ptp.hex(responseCode));
                    return callback && callback(err || responseCode);
                }
                camera.status.liveview = true;
                _logD("LV enabled");
                return waitReady(camera, 3000, callback);
            });
        } else {
            ptp.transaction(camera._dev, 0x9202, [], null, function(err, responseCode) {
                if(err || responseCode != 0x2001) return callback && callback(err || responseCode);
                camera.status.liveview = false;
                _logD("LV disabled");
                return waitReady(camera, 3000, callback);
            });
        }
    } else {
        callback && callback();
    }
}

driver.liveviewImage = function(camera, callback, _tries) {
    if(!_tries) _tries = 1;
    if(camera.status.liveview) {
        if(camera._dev._lvTimer) clearTimeout(camera._dev._lvTimer);
        camera._dev._lvTimer = setTimeout(function(){
            _logD("automatically disabling liveview");
            driver.liveviewMode(camera, false);
        }, 5000);

        ptp.transaction(camera._dev, 0x9203, [], null, function(err, responseCode, data) {
            if(err) return callback && callback(err);
            if(responseCode != 0x2001 && _tries > 10) return callback && callback(responseCode);
            if(responseCode == 0x2001) {
                var image = ptp.extractJpegSimple(data);
                if(image) {
                    return callback && callback(null, image);
                } else {
                    driver.liveviewImage(camera, callback, _tries + 1);
                }
            } else if(responseCode == 0xA00B) { // not in liveview mode
                if(camera.status.liveview) {
                    camera.status.liveview = false;
                    _logD("liveview not enabled, retrying...");
                    driver.liveviewMode(camera, true, function() {
                        setTimeout(function(){ 
                            driver.liveviewImage(camera, callback, _tries + 1);
                        }, 100);
                    });
                } else {
                    callback && callback("not enabled");
                }
            } else {
                setTimeout(function(){
                    driver.liveviewImage(camera, callback, _tries + 1);
                }, 50);
            }
        });
    } else {
        callback && callback("not enabled");
    }
}

driver.moveFocus = function(camera, steps, resolution, callback) {
    var dir = 2;
    if(steps < 0) {
        dir = 1;
        steps = 0 - steps;
    }
    if(!steps) return callback && callback(null, camera.status.focusPos);
    if(!resolution) resolution = 1;
    steps *= resolution;

    ptp.transaction(camera._dev, 0x9204, [dir, resolution * 20], null, function(err, responseCode, data) {
        if(err) {
            return callback && callback(err, camera.status.focusPos);
        }
        if(responseCode == 0xA00C) { // reached end
            _logD("focus end reached, not updating pos");
            return callback && callback(err, camera.status.focusPos);
        } else if(responseCode == 0x2001) {
            camera.status.focusPos += (dir == 1) ? -1 : 1;
            steps--;
            if(steps > 0) {
                return setTimeout(function() {
                    driver.moveFocus(camera, steps, resolution, callback);
                }, 10);
            } else {
                return callback && callback(err, camera.status.focusPos);
            }
        } else {
            err = ptp.hex(responseCode);
            _logD("focus error:", err);
            callback && callback(err, camera.status.focusPos);
        }
    });

}


module.exports = driver;
