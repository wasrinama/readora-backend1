/**
 * In-memory sliding-window Rate Limiter for AI Chatbot
 * Prevents spam, bot abuse, and Gemini API cost spikes.
 * Does not require Redis or external infrastructure.
 */

const ipRequestMap = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 20; // 20 requests per minute per IP

// Clean up stale entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestMap.entries()) {
    if (now - data.startTime > WINDOW_MS * 2) {
      ipRequestMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export function aiRateLimiter(req, res, next) {
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                   req.socket?.remoteAddress || 
                   'unknown_ip';

  const now = Date.now();
  const record = ipRequestMap.get(clientIp);

  if (!record || now - record.startTime > WINDOW_MS) {
    ipRequestMap.set(clientIp, {
      startTime: now,
      count: 1
    });
    return next();
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((record.startTime + WINDOW_MS - now) / 1000);
    res.setHeader('Retry-After', retryAfterSeconds);
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please wait a moment before asking again.',
      retryAfterSeconds
    });
  }

  record.count += 1;
  next();
}
