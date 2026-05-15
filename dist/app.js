"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const pino_http_1 = __importDefault(require("pino-http"));
const pino_1 = __importDefault(require("pino"));
// Rotas
const denuncia_routes_1 = __importDefault(require("./routes/denuncia.routes"));
const academias_routes_1 = __importDefault(require("./routes/academias.routes"));
const crypto_routes_1 = __importDefault(require("./routes/crypto.routes"));
const app = (0, express_1.default)();
const logger = (0, pino_1.default)();
// Middlewares Globais
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express_1.default.json());
// Logger HTTP sem dados sensíveis
app.use((0, pino_http_1.default)({
    logger,
    redact: ['req.headers.authorization', 'req.body.descricao_enc', 'req.body.descricao'],
}));
// Endpoints
app.use('/api/v1/denuncia', denuncia_routes_1.default);
app.use('/api/v1/academias', academias_routes_1.default);
app.use('/api/v1/crypto', crypto_routes_1.default);
// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK' });
});
// Tratamento Global de Erros
app.use((err, req, res, next) => {
    logger.error({ err }, 'Erro interno');
    res.status(500).json({ message: 'Erro interno no servidor' });
});
exports.default = app;
