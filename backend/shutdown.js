function installShutdown(server, closeDatabase, timeoutMs) {
  let stopping = false;
  server.on('request', (_req, res) => {
    res.once('finish', () => {
      // A drained keep-alive request becomes idle after its response finishes.
      if (stopping) setImmediate(() => server.closeIdleConnections());
    });
  });
  async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`Shutdown started (${signal})`);
    // This deadline covers both HTTP drain and pool closure, including stuck work.
    const deadline = setTimeout(() => {
      console.error('Shutdown deadline exceeded; forcing exit');
      server.closeAllConnections();
      process.exit(1);
    }, timeoutMs);
    try {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeIdleConnections();
      });
      await closeDatabase();
      clearTimeout(deadline);
      console.log('Shutdown complete; database pool closed');
      process.exit(0);
    } catch {
      console.error('Shutdown cleanup failed');
      process.exit(1);
    }
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

module.exports = { installShutdown };
