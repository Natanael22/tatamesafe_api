/**
 * Worker de Denúncias — BullMQ
 *
 * Processa eventos da fila 'denuncia-queue':
 *  - denuncia.nova: calcula SLA, define prazo, notifica se crítico
 *  - denuncia.sla-check: verifica violações de SLA e escala
 */

import { Worker, Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { supabaseVault } from '../lib/supabase';
import { notificarAlertaCritico, notificarSlaViolado } from '../services/notificacao.service';
import { SLA_HORAS, type Urgencia, type DenunciaStatus } from '../types/database.types';
import logger from '../lib/logger';

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Fila para jobs de verificação periódica de SLA
const slaQueue = new Queue('sla-check-queue', { connection });

// ---------------------------------------------------------------------------
// Auxiliar: calcular prazo SLA a partir da urgência
// ---------------------------------------------------------------------------
function calcularPrazoSla(urgencia: Urgencia): Date {
  const horas = SLA_HORAS[urgencia] ?? 24;
  const prazo = new Date();
  prazo.setHours(prazo.getHours() + horas);
  return prazo;
}

// ---------------------------------------------------------------------------
// Auxiliar: registrar SLA no banco da denúncia
// ---------------------------------------------------------------------------
async function registrarPrazoSla(protocolo: string, urgencia: Urgencia): Promise<void> {
  const prazo = calcularPrazoSla(urgencia);

  const { error } = await supabaseVault
    .from('Denuncia')
    .update({ sla_prazo: prazo.toISOString() })
    .eq('protocolo', protocolo);

  if (error) {
    logger.error(error, `Falha ao registrar SLA para denúncia ${protocolo}`);
  } else {
    logger.info(`SLA definido para ${protocolo}: ${prazo.toISOString()} (${SLA_HORAS[urgencia]}h)`);
  }
}

// ---------------------------------------------------------------------------
// Worker Principal — processa jobs da fila 'denuncia-queue'
// ---------------------------------------------------------------------------
export const denunciaWorker = new Worker(
  'denuncia-queue',
  async (job: Job) => {
    logger.info(`[Worker] Processando job "${job.name}" — protocolo: ${job.data.protocolo}`);

    // ── denuncia.nova ──────────────────────────────────────────────────────
    if (job.name === 'denuncia.nova') {
      const { protocolo, urgencia, envolve_menor, tipo } = job.data as {
        protocolo: string;
        urgencia: Urgencia;
        envolve_menor: boolean;
        tipo?: string;
      };

      // 1. Calcular e persistir prazo SLA
      await registrarPrazoSla(protocolo, urgencia);

      // 2. Notificar imediatamente se caso crítico
      if (urgencia === 'CRITICA' || envolve_menor) {
        logger.warn(`[Worker] ALERTA CRÍTICO — denúncia ${protocolo} (urgência: ${urgencia}, menor: ${envolve_menor})`);

        await notificarAlertaCritico({ protocolo, urgencia, envolve_menor, tipo });
      }

      // 3. Agendar verificação de SLA no prazo configurado
      const delayMs = SLA_HORAS[urgencia] * 60 * 60 * 1000;
      await slaQueue.add(
        'sla.verificar',
        { protocolo, urgencia },
        {
          delay: delayMs,
          jobId: `sla-${protocolo}`, // evita duplicatas
          removeOnComplete: true,
        }
      );

      logger.info(`[Worker] SLA check agendado para ${protocolo} em ${SLA_HORAS[urgencia]}h`);
    }

    return { success: true, protocolo: job.data.protocolo };
  },
  { connection }
);

// ---------------------------------------------------------------------------
// Worker de Verificação de SLA — processa jobs da fila 'sla-check-queue'
// ---------------------------------------------------------------------------
export const slaWorker = new Worker(
  'sla-check-queue',
  async (job: Job) => {
    const { protocolo, urgencia } = job.data as { protocolo: string; urgencia: Urgencia };

    logger.info(`[SLA Worker] Verificando SLA da denúncia ${protocolo}`);

    // Busca denúncia no vault
    const { data: denuncia, error } = await supabaseVault
      .from('Denuncia')
      .select('id, protocolo, status, urgencia, criado_em, sla_prazo')
      .eq('protocolo', protocolo)
      .maybeSingle();

    if (error || !denuncia) {
      logger.warn(`[SLA Worker] Denúncia ${protocolo} não encontrada ou erro: ${error?.message}`);
      return;
    }

    // Se já foi encerrada, não há violação
    const statusFinal: DenunciaStatus[] = ['ENCERRADA'];
    if (statusFinal.includes(denuncia.status as DenunciaStatus)) {
      logger.info(`[SLA Worker] Denúncia ${protocolo} já encerrada. Nenhuma violação.`);
      return;
    }

    // Calcular horas em aberto
    const criado = new Date(denuncia.criado_em);
    const agora = new Date();
    const horasEmAberto = Math.floor((agora.getTime() - criado.getTime()) / (1000 * 60 * 60));
    const slaHoras = SLA_HORAS[urgencia as Urgencia] ?? 24;

    if (horasEmAberto >= slaHoras) {
      logger.warn(`[SLA Worker] ⏰ SLA VIOLADO — denúncia ${protocolo} (${horasEmAberto}h em aberto, limite: ${slaHoras}h)`);

      await notificarSlaViolado({
        protocolo,
        urgencia: denuncia.urgencia,
        horas_em_aberto: horasEmAberto,
        status: denuncia.status,
      });

      // Reagendar nova verificação em 2h para escalada contínua
      await slaQueue.add(
        'sla.verificar',
        { protocolo, urgencia },
        {
          delay: 2 * 60 * 60 * 1000,
          jobId: `sla-${protocolo}-${Date.now()}`,
          removeOnComplete: true,
        }
      );
    }
  },
  { connection }
);

// ---------------------------------------------------------------------------
// Handlers de evento
// ---------------------------------------------------------------------------
denunciaWorker.on('completed', (job) => {
  logger.info(`[Worker] Job ${job.id} (${job.name}) concluído`);
});

denunciaWorker.on('failed', (job, err) => {
  logger.error(err, `[Worker] Job ${job?.id} (${job?.name}) falhou`);
});

slaWorker.on('completed', (job) => {
  logger.info(`[SLA Worker] Job ${job.id} concluído`);
});

slaWorker.on('failed', (job, err) => {
  logger.error(err, `[SLA Worker] Job ${job?.id} falhou`);
});
