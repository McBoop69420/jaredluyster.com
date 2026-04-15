const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
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
                { host: 'localhost', port, path: '/bible-viewer.html', method: 'HEAD' },
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

async function startServer() {
    const inUse = await isPortInUse(PORT);
    if (!inUse) {
        serverProcess = spawn('python3', ['-m', 'http.server', String(PORT)], {
            cwd: PROJECT_DIR,
            stdio: 'ignore',
        });
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 860,
        title: 'Bible Viewer',
        backgroundColor: '#0d0a12',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadURL(`http://localhost:${PORT}/bible-viewer.html`);

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
    if (serverProcess) serverProcess.kill();
    app.quit();
});

app.on('activate', () => {
    if (!mainWindow) createWindow();
});
