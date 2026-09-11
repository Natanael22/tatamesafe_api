import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../lib/redis';
import { createHash } from 'crypto';

const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || 'default-salt';

export const denunciaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // limite de 50 requisições por IP por hora
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
  // skip: (req) => req.body?.urgencia === 'CRITICA', // Removido por segurança (fechando brecha de bypass do limiter)
});
