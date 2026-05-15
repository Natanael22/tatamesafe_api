"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.denunciaWorker = void 0;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const connection = new ioredis_1.default(process.env.REDIS_URL || 'redis://localhost:6379');
exports.denunciaWorker = new bullmq_1.Worker('denuncia-queue', async (job) => {
    console.log(`Processando nova denúncia do evento: ${job.name} (Protocolo: ${job.data.protocolo})`);
    const { urgencia, envolve_menor, protocolo } = job.data;
    // Se urgencia = CRITICA ou envolve_menor = true:
    // -> Notificação imediata ao operador de plantão (Twilio SMS / SendGrid Email)
    if (urgencia === 'CRITICA' || envolve_menor) {
        console.log(`[ALERTA CRÍTICO] Denúncia ${protocolo} requer atenção imediata!`);
        // TODO: Implementar chamadas Twilio / SendGrid aqui
    }
    // Processamento concluído
    return { success: true, protocolo };
}, { connection });
exports.denunciaWorker.on('completed', (job) => {
    console.log(`Job ${job.id} concluído com sucesso`);
});
exports.denunciaWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} falhou com erro: ${err.message}`);
});
