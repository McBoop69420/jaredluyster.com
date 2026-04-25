const { app, BrowserWindow } = require('electron');
const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8091;
const PROJECT_DIR = path.join(__dirname, '..');

let mainWindow;
let serverProcess;

function isPortInUse(port) {
    return new Promise((resolve) => {
        const req = http.request({ host: 'localhost', port, path: '/', method: 'HEAD' }, () => resolve(true));
        req.on('error', () => resolve(false));
        req.end();
    });
}

function waitForServer(port, retries = 30) {
    return new Promise((resolve, reject) => {
        function attempt() {
            const req = http.request(
                { host: 'localhost', port, path: '/atlas.html', method: 'HEAD' },
                () => resolve()
            );
            req.on('error', () => {
                if (retries-- > 0) setTimeout(attempt, 150);
                else reject(new Error('Server did not start'));
            });
            req.end();
        }
        attempt();
    });
}

function killServer() {
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    // Also kill any orphaned server on this port from a previous session
    try {
        execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore' });
    } catch (_) {}
}

async function startServer() {
    // Kill any leftover server from a crashed previous session
    killServer();
    serverProcess = spawn('python3', ['-m', 'http.server', String(PORT)], {
        cwd: PROJECT_DIR,
        stdio: 'ignore',
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        title: 'Atlas',
        backgroundColor: '#0d0a12',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadURL(`http://localhost:${PORT}/atlas.html`);

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(async () => {
    await startServer();
    try {
        await waitForServer(PORT);
    } catch (_) { /* open anyway */ }
    createWindow();
});

app.on('window-all-closed', () => {
    killServer();
    app.quit();
});

app.on('before-quit', () => {
    killServer();
});

process.on('SIGTERM', () => { killServer(); process.exit(0); });
process.on('SIGINT',  () => { killServer(); process.exit(0); });

app.on('activate', () => {
    if (!mainWindow) createWindow();
});
