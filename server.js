const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocketServer = require('ws').Server;
const child_process = require('child_process');
const url = require('url');

const port = parseInt(process.env.PORT, 10) || 3002;
const dev = process.env.NODE_ENV !== 'production';
const server = next({ dev });
const handle = server.getRequestHandler();

server.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        const { pathname, query } = parsedUrl;

        handle(req, res, parsedUrl);
    }).listen(port, err => {
        if (err) throw err;
        console.log(`> Ready on port ${port}`);
    });

    const wss = new WebSocketServer({
        server: server
    });

    wss.on('connection', (ws, req) => {
        console.log('Streaming socket connected');

        const queryString = url.parse(req.url).search;
        const params = new URLSearchParams(queryString);
        const key = params.get('key');

        const rtmpUrl = `rtmps://global-live.mux.com/app/${key}`;

        const ffmpeg = child_process.spawn('ffmpeg', [
            '-i','-',
            '-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency',
            '-c:a', 'aac', '-ar', '44100', '-b:a', '64k',
            '-y',
            '-use_wallclock_as_timestamps', '1',
            '-async', '1',
            '-bufsize', '1000',
            '-f', 'flv',
            rtmpUrl
        ]);

        ffmpeg.on('close', (code, signal) => {
            console.log('FFmpeg child process closed, code ' + code + ', signal ' + signal);
            ws.terminate();
        });

        ffmpeg.stdin.on('error', (e) => {
            console.log('FFmpeg STDIN Error', e);
        });

        ffmpeg.stderr.on('data', (data) => {
            ws.send('ffmpeg got some data');
            console.log('FFmpeg STDERR:', data.toString());
        });

        ws.on('message', msg => {
            if (Buffer.isBuffer(msg)) {
                console.log('This is some video data');
                ffmpeg.stdin.write(msg);
            } else {
                console.log(msg);
            }
        });

        ws.on('close', e => {
            console.log('Connection closed');
            ffmpeg.kill('SIGINT');
        });
    });
});