/**
 * WebSocket Development Server for Hot Reload
 *
 * This server:
 * 1. Listens on ws://localhost:13131
 * 2. Watches dist/cdn-test1.js for changes
 * 3. Broadcasts reload messages to all connected clients
 * 4. Handles client reconnection gracefully
 */

const WebSocket = require('ws');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const pkg = require('../package.json');
const { toKebabCase } = require('./script-util.js');

// Configuration
const DEV_SERVER_PORT = 13131;
const DIST_FILE = path.resolve(__dirname, `../dist/${toKebabCase(pkg.name)}.js`);

// State
let wss = null;
let watcher = null;
const clients = new Set();

/**
 * Initialize WebSocket Server
 */
function initWebSocketServer() {
  wss = new WebSocket.Server({
    port: DEV_SERVER_PORT,
    clientTracking: true
  });

  wss.on('connection', (ws, req) => {
    const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
    clients.add(ws);

    console.log(`[DevServer] Client connected: ${clientId} (${clients.size} total)`);

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Hot reload enabled',
      port: DEV_SERVER_PORT,
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
    if (error.code === 'EADDRINUSE') {
      console.error(`[DevServer] Port ${DEV_SERVER_PORT} is already in use. Please close other dev servers.`);
      process.exit(1);
    } else {
      console.error('[DevServer] Server error:', error);
    }
  });

  console.log(`\n🚀 [DevServer] WebSocket server started on ws://localhost:${DEV_SERVER_PORT}`);
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

// Handle process signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', (error) => {
  console.error('[DevServer] Uncaught exception:', error);
  shutdown();
});

// Start server
initWebSocketServer();
initFileWatcher();

// Keep process alive
console.log('💡 Press Ctrl+C to stop the dev server\n');
