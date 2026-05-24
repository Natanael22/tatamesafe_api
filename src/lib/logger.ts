import pino from 'pino';
import path from 'path';

const isDev = process.env.NODE_ENV?.trim() === 'development';

// Logger Pino configurado para desenvolvimento (pretty print) ou produção (JSON)
const pinoLogger = pino(
  isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            ignore: 'pid,hostname',
            translateTime: 'SYS:standard',
          },
        },
      }
    : {
        level: process.env.LOG_LEVEL || 'info',
      }
);

// Função auxiliar para extrair detalhes e formatar erros no ambiente de desenvolvimento
function formatDevError(err: any): string {
  if (!err) return '';

  let message = err.message || String(err);
  let fileName = 'desconhecido';
  let lineCol = '';
  let stack = err.stack || '';

  // Extrair detalhes de validação (Zod) se existirem
  let validationDetails = '';
  if (err && Array.isArray(err.issues)) {
    validationDetails = '\n[Validação de campos]:';
    err.issues.forEach((issue: any) => {
      const fieldPath = issue.path.join('.');
      validationDetails += `\n  - ${fieldPath || 'campo'}: ${issue.message}`;
    });
    message = `Erro de validação de campos.${validationDetails}`;
  } else if (err && err.name === 'ZodError' && err.errors) {
    validationDetails = '\n[Validação de campos]:';
    err.errors.forEach((e: any) => {
      const fieldPath = e.path.join('.');
      validationDetails += `\n  - ${fieldPath || 'campo'}: ${e.message}`;
    });
    message = `Erro de validação de campos.${validationDetails}`;
  }

  if (err.stack) {
    const stackLines = err.stack.split('\n');
    // Encontrar a primeira linha do stack trace que seja do nosso próprio código (src)
    const projectLine = stackLines.find(
      (line: string) => line.includes('src/') || line.includes('src\\')
    );

    if (projectLine) {
      // Capturar caminho do arquivo, linha e coluna
      const match = projectLine.match(/[\(\s]([^\(\s]+):(\d+):(\d+)\)?$/) || projectLine.match(/at\s+(.+):(\d+):(\d+)$/);
      if (match) {
        const fullPath = match[1];
        const line = match[2];
        const col = match[3];

        const rootDir = process.cwd();
        if (fullPath.startsWith(rootDir)) {
          fileName = path.relative(rootDir, fullPath).replace(/\\/g, '/');
        } else {
          fileName = path.basename(fullPath);
        }
        lineCol = `:${line}:${col}`;
      }
    } else if (stackLines.length > 1) {
      // Fallback para a primeira linha do stack que não seja a mensagem
      const match = stackLines[1].match(/[\(\s]([^\(\s]+):(\d+):(\d+)\)?$/) || stackLines[1].match(/at\s+(.+):(\d+):(\d+)$/);
      if (match) {
        fileName = path.basename(match[1]);
        lineCol = `:${match[2]}:${match[3]}`;
      }
    }
  }

  // Filtrar stack trace para manter apenas as linhas do nosso código (deixando mais limpo)
  const cleanStack = err.stack
    ? err.stack
        .split('\n')
        .slice(1) // Ignorar a mensagem
        .map((line: string) => line.trim())
        .filter((line: string) => line.includes('src/') || line.includes('src\\') || !line.includes('node_modules'))
        .slice(0, 5) // Exibir no máximo as 5 primeiras linhas relevantes
        .join('\n    ')
    : '';

  const red = '\x1b[31m';
  const yellow = '\x1b[33m';
  const reset = '\x1b[0m';
  const bold = '\x1b[1m';

  return `${red}${bold}erro:${reset} no arquivo ${bold}${fileName}${lineCol}${reset}\n${yellow}stacktrace:${reset} ${message}${cleanStack ? `\n    ${cleanStack}` : ''}`;
}

export const logger = {
  info(msg: string, ...args: any[]) {
    pinoLogger.info(msg, ...args);
  },
  warn(msg: string, ...args: any[]) {
    pinoLogger.warn(msg, ...args);
  },
  error(err: any, msg?: string, ...args: any[]) {
    if (isDev) {
      const errorMsg = msg ? `\x1b[31m[ERROR] ${msg}\x1b[0m\n` : '';
      const formattedError = formatDevError(err);
      console.error(`${errorMsg}${formattedError}`, ...args);
    } else {
      if (err instanceof Error) {
        pinoLogger.error({ err }, msg || err.message, ...args);
      } else {
        pinoLogger.error(err, msg, ...args);
      }
    }
  },
  debug(msg: string, ...args: any[]) {
    pinoLogger.debug(msg, ...args);
  },
  // Exportar a instância original do Pino caso o pino-http queira usar diretamente
  pinoInstance: pinoLogger,
};

export default logger;
