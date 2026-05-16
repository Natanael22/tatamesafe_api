import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import Redis from 'ioredis';
import { createHash } from 'crypto';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || 'default-salt';

export const denunciaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.call(args[0], ...args.slice(1)) as any,
  }),
  keyGenerator: (req, res) => {
    const rawIp = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';
    const ip = ipKeyGenerator(rawIp);
    // Hash IP to avoid storing PII in redis
    return createHash('sha256').update(ip + RATE_LIMIT_SALT).digest('hex');
  },
  validate: {
    xForwardedForHeader: false,
  },
  skip: (req) => req.body?.urgencia === 'CRITICA', // Don't block emergencies
});
