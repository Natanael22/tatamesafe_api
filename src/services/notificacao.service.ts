/**
 * Serviço de Notificações — Twilio SMS + SendGrid Email
 *
 * Implementa notificações para operadores de plantão em casos críticos.
 * Degrada graciosamente se as variáveis de ambiente não estiverem configuradas.
 */

import logger from '../lib/logger';

// ---------------------------------------------------------------------------
// Configurações
// ---------------------------------------------------------------------------
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;
const OPERADOR_PLANTAO_NUMBER = process.env.OPERADOR_PLANTAO_NUMBER;

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'noreply@tatamasafe.com.br';
const OPERADOR_EMAIL = process.env.OPERADOR_PLANTAO_EMAIL;

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface NotificacaoAlertaCritico {
  protocolo: string;
  urgencia: string;
  envolve_menor: boolean;
  tipo?: string;
}

export interface NotificacaoSlaViolado {
  protocolo: string;
  urgencia: string;
  horas_em_aberto: number;
  status: string;
}

// ---------------------------------------------------------------------------
// SMS via Twilio
// ---------------------------------------------------------------------------
async function enviarSMS(para: string, mensagem: string): Promise<void> {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    logger.warn('Twilio não configurado — SMS não enviado. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER');
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');

  const body = new URLSearchParams({
    To: para,
    From: TWILIO_FROM_NUMBER,
    Body: mensagem,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const erro = await response.text();
    throw new Error(`Twilio erro ${response.status}: ${erro}`);
  }

  logger.info(`SMS enviado para ${para.slice(0, -4)}****`);
}

// ---------------------------------------------------------------------------
// Email via SendGrid
// ---------------------------------------------------------------------------
async function enviarEmail(para: string, assunto: string, htmlBody: string): Promise<void> {
  if (!SENDGRID_API_KEY) {
    logger.warn('SendGrid não configurado — email não enviado. Configure SENDGRID_API_KEY');
    return;
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: para }] }],
      from: { email: SENDGRID_FROM_EMAIL, name: 'TatameSafe — Sistema' },
      subject: assunto,
      content: [{ type: 'text/html', value: htmlBody }],
    }),
  });

  if (!response.ok) {
    const erro = await response.text();
    throw new Error(`SendGrid erro ${response.status}: ${erro}`);
  }

  logger.info(`Email enviado para ${para.split('@')[0].slice(0, 3)}***@${para.split('@')[1]}`);
}

// ---------------------------------------------------------------------------
// Notificação de Alerta Crítico
// Disparada quando urgencia = CRITICA ou envolve_menor = true
// ---------------------------------------------------------------------------
export async function notificarAlertaCritico(dados: NotificacaoAlertaCritico): Promise<void> {
  const { protocolo, urgencia, envolve_menor, tipo } = dados;

  const motivo = envolve_menor ? '🚨 ENVOLVE MENOR DE IDADE' : `🔴 URGÊNCIA ${urgencia}`;
  const mensagemSMS = `[TatameSafe ALERTA] ${motivo}\nProtocolo: ${protocolo}\nAcesse o painel imediatamente.`;

  const htmlEmail = `
    <h2 style="color:#c00">⚠️ Alerta Crítico — TatameSafe</h2>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;font-weight:bold">Protocolo</td><td style="padding:8px">${protocolo}</td></tr>
      <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold">Urgência</td><td style="padding:8px;color:#c00">${urgencia}</td></tr>
      ${tipo ? `<tr><td style="padding:8px;font-weight:bold">Tipo</td><td style="padding:8px">${tipo}</td></tr>` : ''}
      <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold">Envolve Menor</td><td style="padding:8px">${envolve_menor ? '⚠️ SIM' : 'Não'}</td></tr>
    </table>
    <br>
    <a href="${API_BASE_URL}/api-docs" style="background:#c00;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">
      Acessar Painel Admin
    </a>
    <p style="color:#666;font-size:12px;margin-top:20px">
      Esta notificação é automática. O conteúdo da denúncia está disponível apenas no painel com autenticação MFA.
    </p>
  `;

  const erros: string[] = [];

  // SMS para operador de plantão
  if (OPERADOR_PLANTAO_NUMBER) {
    try {
      await enviarSMS(OPERADOR_PLANTAO_NUMBER, mensagemSMS);
    } catch (err: any) {
      erros.push(`SMS: ${err.message}`);
      logger.error(err, `Falha ao enviar SMS de alerta crítico para denúncia ${protocolo}`);
    }
  }

  // Email para operador de plantão
  if (OPERADOR_EMAIL) {
    try {
      await enviarEmail(
        OPERADOR_EMAIL,
        `[URGENTE] Denúncia ${protocolo} — ${motivo}`,
        htmlEmail
      );
    } catch (err: any) {
      erros.push(`Email: ${err.message}`);
      logger.error(err, `Falha ao enviar email de alerta crítico para denúncia ${protocolo}`);
    }
  }

  if (erros.length > 0) {
    logger.warn(`Notificação parcialmente entregue para ${protocolo}. Erros: ${erros.join(', ')}`);
  }
}

// ---------------------------------------------------------------------------
// Notificação de Violação de SLA
// Disparada quando uma denúncia ultrapassa o prazo SLA
// ---------------------------------------------------------------------------
export async function notificarSlaViolado(dados: NotificacaoSlaViolado): Promise<void> {
  const { protocolo, urgencia, horas_em_aberto, status } = dados;

  const mensagemSMS = `[TatameSafe SLA] ⏰ Denúncia ${protocolo} (${urgencia}) está há ${horas_em_aberto}h sem resposta. Status: ${status}`;

  const htmlEmail = `
    <h2 style="color:#e65c00">⏰ Violação de SLA — TatameSafe</h2>
    <p>Uma denúncia ultrapassou o prazo de atendimento configurado.</p>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:8px;font-weight:bold">Protocolo</td><td style="padding:8px">${protocolo}</td></tr>
      <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold">Urgência</td><td style="padding:8px;color:#e65c00">${urgencia}</td></tr>
      <tr><td style="padding:8px;font-weight:bold">Status Atual</td><td style="padding:8px">${status}</td></tr>
      <tr style="background:#f9f9f9"><td style="padding:8px;font-weight:bold">Tempo em Aberto</td><td style="padding:8px;color:#c00">${horas_em_aberto}h</td></tr>
    </table>
    <br>
    <a href="${API_BASE_URL}/api-docs" style="background:#e65c00;color:white;padding:10px 20px;text-decoration:none;border-radius:4px">
      Atender Agora
    </a>
  `;

  if (OPERADOR_PLANTAO_NUMBER) {
    try {
      await enviarSMS(OPERADOR_PLANTAO_NUMBER, mensagemSMS);
    } catch (err: any) {
      logger.error(err, `Falha ao enviar SMS de SLA violado para denúncia ${protocolo}`);
    }
  }

  if (OPERADOR_EMAIL) {
    try {
      await enviarEmail(
        OPERADOR_EMAIL,
        `[SLA VIOLADO] Denúncia ${protocolo} — ${horas_em_aberto}h sem atendimento`,
        htmlEmail
      );
    } catch (err: any) {
      logger.error(err, `Falha ao enviar email de SLA violado para denúncia ${protocolo}`);
    }
  }
}
