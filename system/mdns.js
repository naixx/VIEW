// Minimal mDNS responder (RFC 6762) for one name, so phones reach the VIEW as http://view.local/ on a shared Wi-Fi
// without knowing its DHCP address. Answers A / ANY queries with wlan0's current IPv4 and asserts with an NSEC record
// that the name has no other types (iOS asks A and AAAA at once; without the NSEC it would wait out the AAAA).
// Runs inside the UI process: no avahi on the unit, and the kernel allows multicast joins only once
// igmp_max_memberships is raised from 0 (app.js writes it). Node 0.10: no setMulticastInterface, no Buffer.from.
var dgram = require('dgram');
var os = require('os');

var NAME = 'view.local';
var IFACE = 'wlan0';
var GROUP = '224.0.0.251';
var PORT = 5353;
var TTL = 120;
var LEGACY_TTL = 10; // RFC 6762 §6.7: answers to legacy (non-5353) unicast queries
var REJOIN_MS = 5000; // wlan0 changes address between the hotspot (10.0.0.1) and a shared Wi-Fi

var TYPE_A = 1, TYPE_NSEC = 47, TYPE_ANY = 255, CLASS_IN = 1, TOP_BIT = 0x8000; // top class bit: QU / cache-flush

var sock = null;
var joinedIp = null;
var timer = null;

function log(s) {
    console.log('mDNS: ' + s);
}

function ifaceIp() {
    var list = os.networkInterfaces()[IFACE] || [];
    for (var i = 0; i < list.length; i++) {
        if (list[i].family == 'IPv4' && !list[i].internal) return list[i].address;
    }
    return null;
}

// Reads a possibly compressed name at off; returns it lower-cased with the offset just past it.
function readName(buf, off) {
    var labels = [], end = -1, jumps = 0;
    for (;;) {
        var len = buf[off];
        if (len === undefined) throw new Error('name past end');
        if (len == 0) { off++; break; }
        if ((len & 0xc0) == 0xc0) {
            if (end < 0) end = off + 2;
            if (++jumps > 16) throw new Error('pointer loop');
            off = ((len & 0x3f) << 8) | buf[off + 1];
            continue;
        }
        labels.push(buf.toString('utf8', off + 1, off + 1 + len));
        off += 1 + len;
    }
    return { name: labels.join('.').toLowerCase(), end: end < 0 ? off : end };
}

function encodeName(name) {
    var parts = [];
    name.split('.').forEach(function (label) {
        var b = new Buffer(label, 'utf8');
        parts.push(new Buffer([b.length]), b);
    });
    parts.push(new Buffer([0]));
    return Buffer.concat(parts);
}

function record(type, cls, ttl, rdata) {
    var head = new Buffer(10);
    head.writeUInt16BE(type, 0);
    head.writeUInt16BE(cls, 2);
    head.writeUInt32BE(ttl, 4);
    head.writeUInt16BE(rdata.length, 8);
    return Buffer.concat([encodeName(NAME), head, rdata]);
}

function aRecord(ip, cls, ttl) {
    return record(TYPE_A, cls, ttl, new Buffer(ip.split('.').map(Number)));
}

// NSEC whose type bitmap holds only A (window 0, 1 byte, bit 1): the name has an A record and nothing else (§6.1).
function nsecRecord(cls, ttl) {
    return record(TYPE_NSEC, cls, ttl, Buffer.concat([encodeName(NAME), new Buffer([0, 1, 0x40])]));
}

function question(type) {
    var tail = new Buffer(4);
    tail.writeUInt16BE(type, 0);
    tail.writeUInt16BE(CLASS_IN, 2);
    return Buffer.concat([encodeName(NAME), tail]);
}

function message(id, questions, answers, additionals) {
    var head = new Buffer(12);
    head.writeUInt16BE(id, 0);
    head.writeUInt16BE(0x8400, 2); // QR | AA
    head.writeUInt16BE(questions.length, 4);
    head.writeUInt16BE(answers.length, 6);
    head.writeUInt16BE(0, 8);
    head.writeUInt16BE(additionals.length, 10);
    return Buffer.concat([head].concat(questions, answers, additionals));
}

function send(buf, port, host, what) {
    if (!sock) return;
    sock.send(buf, 0, buf.length, port, host, function (err) {
        if (err) log('send failed (' + what + ' -> ' + host + '): ' + err.message);
    });
}

function announce(ip) {
    send(message(0, [], [aRecord(ip, CLASS_IN | TOP_BIT, TTL)], [nsecRecord(CLASS_IN | TOP_BIT, TTL)]),
        PORT, GROUP, 'announce ' + NAME + ' = ' + ip);
}

// (Re)joins the group on wlan0's current address.
function join() {
    if (!sock) return;
    var ip = ifaceIp();
    if (ip == joinedIp) return;
    if (joinedIp) {
        try { sock.dropMembership(GROUP, joinedIp); } catch (e) { /* the old address is gone anyway */ }
    }
    joinedIp = null;
    if (!ip) return;
    try {
        sock.addMembership(GROUP, ip);
        joinedIp = ip;
        log('answering ' + NAME + ' with ' + ip);
        announce(ip);
    } catch (e) {
        log('cannot join ' + GROUP + ' on ' + ip + ': ' + e.message + ' (igmp_max_memberships?)');
    }
}

function handle(msg, rinfo) {
    if (msg.length < 12 || (msg.readUInt16BE(2) & 0x8000)) return; // too short, or a response
    var id = msg.readUInt16BE(0), count = msg.readUInt16BE(4), off = 12;
    var wantA = false, wantOther = false, qu = false, asked = [];
    for (var i = 0; i < count; i++) {
        var q = readName(msg, off);
        var type = msg.readUInt16BE(q.end), cls = msg.readUInt16BE(q.end + 2);
        off = q.end + 4;
        if (q.name != NAME || (cls & 0x7fff) != CLASS_IN) continue;
        if (cls & TOP_BIT) qu = true;
        if (type == TYPE_A || type == TYPE_ANY) wantA = true; else wantOther = true;
        asked.push(type);
    }
    if (!asked.length) return;
    var ip = ifaceIp();
    if (!ip) return;

    var legacy = rinfo.port != PORT;
    var cls = legacy ? CLASS_IN : CLASS_IN | TOP_BIT, ttl = legacy ? LEGACY_TTL : TTL;
    var a = aRecord(ip, cls, ttl), nsec = nsecRecord(cls, ttl);
    var answers = [], additionals = [];
    (wantA ? answers : additionals).push(a);
    (wantOther ? answers : additionals).push(nsec);
    var reply = message(legacy ? id : 0, legacy ? asked.map(question) : [], answers, additionals);

    var what = 'reply to ' + rinfo.address + ':' + rinfo.port;
    if (legacy || qu) send(reply, rinfo.port, rinfo.address, what);
    else send(reply, PORT, GROUP, what);
}

exports.start = function () {
    if (sock) return;
    sock = dgram.createSocket('udp4');
    sock.on('message', function (msg, rinfo) {
        try { handle(msg, rinfo); } catch (e) { /* not a packet we can parse */ }
    });
    sock.on('error', function (e) {
        log('socket error: ' + e.message);
    });
    sock.bind(PORT, function () {
        sock.setMulticastTTL(255);
        join();
        timer = setInterval(join, REJOIN_MS);
    });
};

exports.stop = function () {
    if (timer) clearInterval(timer);
    timer = null;
    if (sock) {
        try { sock.close(); } catch (e) { /* already closed */ }
    }
    sock = null;
    joinedIp = null;
};
