import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import pino from 'pino';

// Rotas
import denunciaRoutes from './routes/denuncia.routes';
import academiasRoutes from './routes/academias.routes';
import cryptoRoutes from './routes/crypto.routes';

const app: Express = express();
const logger = pino();

// Middlewares Globais
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

// Logger HTTP sem dados sensíveis
app.use(
  pinoHttp({
    logger,
    redact: ['req.headers.authorization', 'req.body.descricao_enc', 'req.body.descricao'],
  })
);

// Endpoints
app.use('/api/v1/denuncia', denunciaRoutes);
app.use('/api/v1/academias', academiasRoutes);
app.use('/api/v1/crypto', cryptoRoutes);

// Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK' });
});

// Tratamento Global de Erros
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error({ err }, 'Erro interno');
  res.status(500).json({ message: 'Erro interno no servidor' });
});

export default app;
