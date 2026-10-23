// Express middleware: answers a request for <file> with <file>.gz when the client accepts gzip. The browser client
// under /app ships its big files (wasm, js) only as .gz — the single 400 MHz core can't compress 10 MB per request,
// and every browser sends Accept-Encoding: gzip — while small files (index.html) stay plain and fall through to
// Express.static. send 0.1.4 keeps the Content-Type / Content-Encoding set here, so the rewritten .gz request goes
// out with the original file's type. Node 0.10, CommonJS.
var fs = require('fs');
var path = require('path');
var url = require('url');

module.exports = function precompressed(root, mime) {
    root = path.normalize(root); // the joined file path is normalized too, so the prefix check compares like with like
    return function (req, res, next) {
        if (req.method != 'GET' && req.method != 'HEAD') return next();
        var parsed = url.parse(req.url);
        var file;
        try {
            file = path.normalize(path.join(root, decodeURIComponent(parsed.pathname)));
        } catch (e) {
            return next();
        }
        if (file.indexOf(root) != 0) return next(); // outside the root: let static answer 403/404
        fs.stat(file + '.gz', function (err, stat) {
            if (err || !stat.isFile()) return next();
            res.setHeader('Vary', 'Accept-Encoding');
            if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
            var type = mime.lookup(file), charset = mime.charsets.lookup(type);
            res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''));
            res.setHeader('Content-Encoding', 'gzip');
            req.url = parsed.pathname + '.gz' + (parsed.search || '');
            next();
        });
    };
};
