"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.denunciaLimiter = void 0;
const express_rate_limit_1 = require("express-rate-limit");
const rate_limit_redis_1 = require("rate-limit-redis");
const ioredis_1 = __importDefault(require("ioredis"));
const crypto_1 = require("crypto");
const redisClient = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || 'default-salt';
exports.denunciaLimiter = (0, express_rate_limit_1.rateLimit)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // limit each IP to 3 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    store: new rate_limit_redis_1.RedisStore({
        sendCommand: (...args) => redisClient.call(args[0], ...args.slice(1)),
    }),
    keyGenerator: (req) => {
        const forwarded = req.headers['x-forwarded-for'];
        const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded || req.ip || 'unknown';
        // Hash IP to avoid storing PII in redis
        return (0, crypto_1.createHash)('sha256').update(ip + RATE_LIMIT_SALT).digest('hex');
    },
    skip: (req) => req.body?.urgencia === 'CRITICA', // Don't block emergencies
});
