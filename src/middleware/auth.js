const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sios-tae-secret-change-me';

function generateTokens(userId) {
  const access_token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '1h' });
  const refresh_token = jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: '30d' });
  return { access_token, refresh_token };
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Middleware: require auth
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.userId = payload.sub;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Middleware: optional auth (sets req.userId if present)
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = verifyToken(header.slice(7));
      req.userId = payload.sub;
    } catch (e) { /* ignore */ }
  }
  next();
}

module.exports = { generateTokens, verifyToken, requireAuth, optionalAuth, JWT_SECRET };
