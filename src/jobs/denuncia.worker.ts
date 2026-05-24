import { Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import logger from '../lib/logger';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const denunciaWorker = new Worker(
  'denuncia-queue',
  async (job: Job) => {
    logger.info(`Processando nova denúncia do evento: ${job.name} (Protocolo: ${job.data.protocolo})`);

    const { urgencia, envolve_menor, protocolo } = job.data;

    // Se urgencia = CRITICA ou envolve_menor = true:
    // -> Notificação imediata ao operador de plantão (Twilio SMS / SendGrid Email)
    if (urgencia === 'CRITICA' || envolve_menor) {
      logger.warn(`[ALERTA CRÍTICO] Denúncia ${protocolo} requer atenção imediata!`);
      // TODO: Implementar chamadas Twilio / SendGrid aqui
    }

    // Processamento concluído
    return { success: true, protocolo };
  },
  { connection }
);

denunciaWorker.on('completed', (job) => {
  logger.info(`Job ${job.id} concluído com sucesso`);
});

denunciaWorker.on('failed', (job, err) => {
  logger.error(err, `Job ${job?.id} falhou`);
});
