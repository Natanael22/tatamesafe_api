import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import logger from './lib/logger';

// Rotas
import denunciaRoutes from './routes/denuncia.routes';
import academiasRoutes from './routes/academias.routes';
import avaliacoesRoutes from './routes/avaliacoes.routes';
import certificadosRoutes from './routes/certificados.routes';
import cryptoRoutes from './routes/crypto.routes';
import usersRoutes from './routes/users.routes';
import authRoutes from './routes/auth.routes';

import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';

const app: Express = express();

// Trust proxy para garantir que o req.ip seja lido corretamente atrás do Nginx/Cloudflare
app.set('trust proxy', 1);

// Configuração do Swagger
const swaggerDocument = YAML.load(path.resolve(process.cwd(), 'swagger.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Middlewares Globais
app.use(helmet());

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['*'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requisições sem origem (como aplicativos móveis, curl, etc.)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Em ambiente de desenvolvimento, permitir qualquer porta no localhost
      const isDev = process.env.NODE_ENV?.trim() === 'development';
      if (isDev && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
        return callback(null, true);
      }

      callback(new Error('Bloqueado por CORS'));
    },
  })
);

app.use(express.json());

const isDev = process.env.NODE_ENV?.trim() === 'development';

// Logger HTTP sem dados sensíveis
app.use(
  pinoHttp({
    logger: logger.pinoInstance,
    redact: isDev ? undefined : ['req.headers.authorization', 'req.body.descricao_enc', 'req.body.descricao'],
    serializers: isDev
      ? {
          req: () => undefined,
          res: () => undefined,
        }
      : undefined,
    customSuccessMessage: isDev
      ? (req, res, responseTime) => `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${responseTime}ms`
      : undefined,
    customErrorMessage: isDev
      ? (req, res, err) => `${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${err.message}`
      : undefined,
  })
);

// Endpoints
app.use('/api/v1/denuncia', denunciaRoutes);
app.use('/api/v1/academias', academiasRoutes);
app.use('/api/v1/avaliacoes', avaliacoesRoutes);
app.use('/api/v1/certificados', certificadosRoutes);
app.use('/api/v1/crypto', cryptoRoutes);
app.use('/api/v1/users', usersRoutes);
app.use('/api/v1/auth', authRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK' });
});

// Tratamento Global de Erros
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error(err, 'Erro interno detectado no servidor');
  res.status(500).json({ message: 'Erro interno no servidor' });
});

export default app;
