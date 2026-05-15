import { rateLimit } from 'express-rate-limit';
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
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = Array.isArray(forwarded) ? forwarded[0] : (forwarded as string) || req.ip || 'unknown';
    // Hash IP to avoid storing PII in redis
    return createHash('sha256').update(ip + RATE_LIMIT_SALT).digest('hex');
  },
  skip: (req) => req.body?.urgencia === 'CRITICA', // Don't block emergencies
});
