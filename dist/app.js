"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = __importDefault(require("./lib/logger"));
// Rotas
const denuncia_routes_1 = __importDefault(require("./routes/denuncia.routes"));
const academias_routes_1 = __importDefault(require("./routes/academias.routes"));
const avaliacoes_routes_1 = __importDefault(require("./routes/avaliacoes.routes"));
const certificados_routes_1 = __importDefault(require("./routes/certificados.routes"));
const crypto_routes_1 = __importDefault(require("./routes/crypto.routes"));
const users_routes_1 = __importDefault(require("./routes/users.routes"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const path_1 = __importDefault(require("path"));
const app = (0, express_1.default)();
// Trust proxy para garantir que o req.ip seja lido corretamente atrás do Nginx/Cloudflare
app.set('trust proxy', 1);
// Configuração do Swagger
const swaggerDocument = yamljs_1.default.load(path_1.default.resolve(process.cwd(), 'swagger.yaml'));
app.use('/api-docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
// Middlewares Globais
app.use((0, helmet_1.default)());
const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
    : ['*'];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Permitir requisições sem origem (como aplicativos móveis, curl, etc.)
        if (!origin)
            return callback(null, true);
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
}));
app.use(express_1.default.json());
const isDev = process.env.NODE_ENV?.trim() === 'development';
// Logger HTTP sem dados sensíveis
app.use((0, pino_http_1.default)({
    logger: logger_1.default.pinoInstance,
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
}));
// Endpoints
app.use('/api/v1/denuncia', denuncia_routes_1.default);
app.use('/api/v1/academias', academias_routes_1.default);
app.use('/api/v1/avaliacoes', avaliacoes_routes_1.default);
app.use('/api/v1/certificados', certificados_routes_1.default);
app.use('/api/v1/crypto', crypto_routes_1.default);
app.use('/api/v1/users', users_routes_1.default);
app.use('/api/v1/auth', auth_routes_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});
// Tratamento Global de Erros
app.use((err, req, res, next) => {
    logger_1.default.error(err, 'Erro interno detectado no servidor');
    res.status(500).json({ message: 'Erro interno no servidor' });
});
exports.default = app;
