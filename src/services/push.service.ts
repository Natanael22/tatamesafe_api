import logger from '../lib/logger';

class PushService {
  /**
   * Envia uma notificação push genérica (anônima/privada) para um conjunto de tokens.
   */
  async enviarNotificacaoStatus(tokens: string[], statusRotulo: string): Promise<void> {
    if (!tokens || tokens.length === 0) return;

    // Usando import dinâmico pois expo-server-sdk é ESM
    const { Expo } = await import('expo-server-sdk');
    const expo = new Expo();

    // Filtra apenas tokens válidos
    const tokensValidos = tokens.filter((token) => Expo.isExpoPushToken(token));
    
    if (tokensValidos.length === 0) {
      logger.warn('Nenhum token Expo válido fornecido para notificação.');
      return;
    }

    // ExpoPushMessage type
    const messages = tokensValidos.map((token) => ({
      to: token,
      sound: 'default',
      title: 'Atualização no TatameSafe',
      // Mantendo a mensagem genérica por questões de segurança (aparece na tela de bloqueio)
      body: `O status da sua denúncia mudou para "${statusRotulo}". Abra o aplicativo para conferir as novidades.`,
      // Dados extras que o app recebe em background (não fica visível na notificação nativa)
      data: { tipo: 'STATUS_UPDATE', status: statusRotulo },
    }));

    // O Expo recomenda enviar em chunks (lotes) de no máximo 100 mensagens
    const chunks = expo.chunkPushNotifications(messages as any);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        logger.error(error, 'Erro ao enviar chunk de push notifications via Expo');
      }
    }

    logger.info(`Push notifications disparadas para ${tokensValidos.length} dispositivo(s).`);
  }
}

export default new PushService();
