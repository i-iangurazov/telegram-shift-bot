module.exports = function assertTestDatabase(raw) {
  const url = new URL(raw);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname === '/shift_bot_test';
  if (!local) throw new Error('Remote database tests are forbidden; use an isolated local restore');
};
