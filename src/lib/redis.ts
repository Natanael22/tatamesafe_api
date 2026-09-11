import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Instância singleton
const redisClient = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

redisClient.on('error', (err) => {
  console.error('Erro na conexão com Redis:', err);
});

export default redisClient;
