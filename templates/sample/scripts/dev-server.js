/**
 * WebSocket Development Server for Hot Reload
 *
 * This server:
 * 1. Automatically finds an available port (starting from 13131)
 * 2. Saves the actual port to .dev-server-port file
 * 3. Watches dist file for changes
 * 4. Broadcasts reload messages to all connected clients
 * 5. Handles client reconnection gracefully
 */

const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const net = require('net');
const pkg = require('../package.json');
const { toKebabCase } = require('./script-util.js');

// Configuration
const DEFAULT_PORT = 13131;
const MAX_PORT_ATTEMPTS = 10;
const PORT_FILE_PATH = path.resolve(__dirname, '../.dev-server-port');
const DIST_FILE = path.resolve(__dirname, `../dist/${toKebabCase(pkg.name)}.js`);

// State
let wss = null;
let watcher = null;
let actualPort = null;
const clients = new Set();

/**
 * Check if a port is available
 * @param {number} port - Port number to check
 * @returns {Promise<boolean>} True if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port);
  });
}

/**
 * Find an available port starting from the default port
 * @param {number} startPort - Starting port number
 * @returns {Promise<number>} Available port number
 */
async function findAvailablePort(startPort = DEFAULT_PORT) {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    console.log(`[DevServer] Port ${port} is in use, trying next...`);
  }

  throw new Error(`[DevServer] No available ports found in range ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1}`);
}

/**
 * Save the actual port to a file for webpack plugin to read
 * @param {number} port - Port number to save
 */
function savePortToFile(port) {
  try {
    fs.writeFileSync(PORT_FILE_PATH, port.toString(), 'utf8');
    console.log(`[DevServer] Port saved to ${PORT_FILE_PATH}`);
  } catch (error) {
    console.error('[DevServer] Failed to save port file:', error.message);
  }
}

/**
 * Initialize WebSocket Server
 * @param {number} port - Port number to use
 */
function initWebSocketServer(port) {
  actualPort = port;

  wss = new WebSocket.Server({
    port: actualPort,
    clientTracking: true
  });

  wss.on('connection', (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    clients.add(ws);

    console.log(`[DevServer] Client connected: ${clientId} (${clients.size} total)`);

    // Send welcome message with actual port
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Hot reload enabled',
      port: actualPort,
      watching: DIST_FILE,
    }));

    // Handle client messages (optional: ping/pong)
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data);
        if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.warn('[DevServer] Invalid message from client:', error.message);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      clients.delete(ws);
      console.log(`[DevServer] Client disconnected: ${clientId} (${clients.size} remaining)`);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error(`[DevServer] WebSocket error for ${clientId}:`, error.message);
      clients.delete(ws);
    });
  });

  wss.on('error', (error) => {
    console.error('[DevServer] Server error:', error);
  });

  // Save port to file for webpack plugin
  savePortToFile(actualPort);

  console.log(`\n🚀 [DevServer] WebSocket server started on ws://localhost:${actualPort}`);
  console.log(`📂 [DevServer] Watching: ${DIST_FILE}\n`);
}

/**
 * Broadcast reload message to all connected clients
 */
function broadcastReload() {
  if (clients.size === 0) {
    console.log('[DevServer] File changed, but no clients connected');
    return;
  }

  // Read updated file content
  let scriptContent = '';
  try {
    scriptContent = fs.readFileSync(DIST_FILE, 'utf8');
  } catch (error) {
    console.error('[DevServer] Failed to read dist file:', error.message);
    return;
  }

  const message = JSON.stringify({
    type: 'reload',
    timestamp: Date.now(),
    file: path.basename(DIST_FILE),
    size: scriptContent.length,
    scriptContent, // Include updated script content
  });

  let successCount = 0;
  clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
      successCount++;
    }
  });

  console.log(`📤 [DevServer] Broadcast reload to ${successCount}/${clients.size} clients (${new Date().toLocaleTimeString()})`);
}

/**
 * Initialize file watcher
 */
function initFileWatcher() {
  watcher = chokidar.watch(DIST_FILE, {
    persistent: true,
    ignoreInitial: true, // Don't trigger on startup
    awaitWriteFinish: {
      stabilityThreshold: 100, // Wait 100ms after last change
      pollInterval: 50,
    },
  });

  watcher.on('change', (changedPath) => {
    console.log(`\n📝 [DevServer] File changed: ${path.basename(changedPath)}`);
    broadcastReload();
  });

  watcher.on('error', (error) => {
    console.error('[DevServer] Watcher error:', error);
  });

  // Check if file exists
  if (!fs.existsSync(DIST_FILE)) {
    console.warn(`⚠️  [DevServer] Warning: ${DIST_FILE} does not exist yet. Waiting for webpack build...`);
  }
}

/**
 * Graceful shutdown
 */
function shutdown() {
  console.log('\n\n🛑 [DevServer] Shutting down...');

  // Close all client connections
  clients.forEach((ws) => {
    ws.close(1000, 'Server shutting down');
  });
  clients.clear();

  // Close watcher
  if (watcher) {
    watcher.close();
  }

  // Close WebSocket server
  if (wss) {
    wss.close(() => {
      console.log('✅ [DevServer] Server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

/**
 * Cleanup port file on shutdown
 */
function cleanupPortFile() {
  try {
    if (fs.existsSync(PORT_FILE_PATH)) {
      fs.unlinkSync(PORT_FILE_PATH);
      console.log('[DevServer] Cleaned up port file');
    }
  } catch (error) {
    console.error('[DevServer] Failed to cleanup port file:', error.message);
  }
}

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  console.error('[DevServer] Uncaught exception:', error);
  shutdown();
});

/**
 * Start the development server
 */
async function startServer() {
  try {
    // Find available port
    console.log(`[DevServer] Looking for available port starting from ${DEFAULT_PORT}...`);
    const port = await findAvailablePort(DEFAULT_PORT);

    // Initialize WebSocket server
    initWebSocketServer(port);

    // Initialize file watcher
    initFileWatcher();

    // Keep process alive
    console.log('💡 Press Ctrl+C to stop the dev server\n');

  } catch (error) {
    console.error('[DevServer] Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start server
startServer();
