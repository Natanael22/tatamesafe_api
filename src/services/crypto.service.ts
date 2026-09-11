import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class CryptoService {
  private static publicKey: string | null = null;
  private static privateKey: string | null = null;

  public static initializeKeys() {
    // ─── PRIORIDADE 1: Variáveis de ambiente (obrigatório na Vercel/serverless) ───
    // As chaves PEM devem estar em RSA_PRIVATE_KEY e RSA_PUBLIC_KEY.
    // No valor da variável, use \n literal para representar quebras de linha,
    // ou codifique em base64 (o código abaixo detecta automaticamente).
    if (process.env.RSA_PRIVATE_KEY && process.env.RSA_PUBLIC_KEY) {
      this.privateKey = this.decodePemEnv(process.env.RSA_PRIVATE_KEY);
      this.publicKey = this.decodePemEnv(process.env.RSA_PUBLIC_KEY);
      console.log('Chaves RSA carregadas das variáveis de ambiente.');
      return;
    }

    // ─── PRIORIDADE 2: Arquivos no disco (desenvolvimento local) ─────────────
    const keyPath = process.env.RSA_PRIVATE_KEY_PATH 
      ? path.resolve(process.env.RSA_PRIVATE_KEY_PATH) 
      : path.join(__dirname, '../../keys/rsa_private.pem');
    const pubPath = keyPath.replace('private', 'public');

    if (fs.existsSync(keyPath) && fs.existsSync(pubPath)) {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
      this.publicKey = fs.readFileSync(pubPath, 'utf8');
      console.log(`Chaves RSA carregadas do disco: ${keyPath}`);
      return;
    }

    // ─── PRIORIDADE 3: Gerar novas chaves APENAS em desenvolvimento ──────────
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'FATAL: Chaves RSA não encontradas em produção! ' +
        'Configure as variáveis de ambiente RSA_PRIVATE_KEY e RSA_PUBLIC_KEY na Vercel. ' +
        'Sem isso, cada deploy gera chaves novas e as denúncias anteriores ficam irrecuperáveis.'
      );
    }

    console.warn('⚠️  DEV: Chaves RSA não encontradas. Gerando novo par de chaves...');
    try {
      const dir = path.dirname(keyPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });

      fs.writeFileSync(keyPath, privateKey, 'utf8');
      fs.writeFileSync(pubPath, publicKey, 'utf8');

      this.privateKey = privateKey;
      this.publicKey = publicKey;
    } catch (err) {
      console.error('Erro ao salvar as chaves RSA geradas no disco. Usando chaves efêmeras em memória...', err);
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      this.publicKey = publicKey;
      this.privateKey = privateKey;
    }
  }

  /**
   * Decodifica o valor de uma variável de ambiente que contém uma chave PEM.
   * Suporta dois formatos:
   *  - PEM direto com \n escapado (ex: "-----BEGIN...-----\nMIIE...\n-----END...-----")
   *  - PEM codificado em base64 (para evitar problemas com \n em painéis como Vercel)
   */
  private static decodePemEnv(value: string): string {
    // Se já começa com "-----BEGIN", é PEM direto (possivelmente com \n literal)
    if (value.startsWith('-----BEGIN')) {
      return value.replace(/\\n/g, '\n');
    }
    // Caso contrário, assume base64
    return Buffer.from(value, 'base64').toString('utf8');
  }


  public static getPublicKey(): string {
    if (!this.publicKey) this.initializeKeys();
    return this.publicKey!;
  }

  // Apenas usado no admin panel (se este backend rodar o admin panel)
  // Na arquitetura real de segurança máxima, a API principal NEM TEM a private key
  public static getPrivateKey(): string {
    if (!this.privateKey) this.initializeKeys();
    return this.privateKey!;
  }

  public static decrypt(encryptedData: string): string {
    try {
      const privateKey = this.getPrivateKey();
      
      // O Supabase retorna bytea geralmente como uma string com prefixo \x
      let buffer: Buffer;
      if (encryptedData.startsWith('\\x')) {
        buffer = Buffer.from(encryptedData.slice(2), 'hex');
      } else if (encryptedData.match(/^[0-9a-fA-F]+$/)) {
        buffer = Buffer.from(encryptedData, 'hex');
      } else {
        // Assume base64
        buffer = Buffer.from(encryptedData, 'base64');
      }

      // ── Tenta parsear como formato v2 (híbrido) ──────────────────────
      try {
        const raw = buffer.toString('utf8');
        const outer = JSON.parse(
          raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
        );

        if (outer.v === 2 && outer.key && outer.iv && outer.tag && outer.ct) {
          // 1. Decifrar a chave AES com RSA
          const wrappedKey = Buffer.from(outer.key, 'base64');
          const aesKey = crypto.privateDecrypt(
            {
              key: privateKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha256',
            },
            wrappedKey
          );

          // 2. Decifrar o texto com AES-256-GCM
          const iv = Buffer.from(outer.iv, 'base64');
          const tag = Buffer.from(outer.tag, 'base64');
          const ct = Buffer.from(outer.ct, 'base64');

          const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
          decipher.setAuthTag(tag);

          let decrypted = decipher.update(ct, undefined, 'utf8');
          decrypted += decipher.final('utf8');

          return decrypted;
        }
      } catch {
        // Não é formato v2 — cai no fallback abaixo
      }

      // ── Fallback: formato v1 (RSA puro / chunking) ───────────────────
      const CHUNK_SIZE = 256;
      
      // Se for maior que um bloco e múltiplo, significa que foi cifrado em partes (chunking)
      if (buffer.length > CHUNK_SIZE && buffer.length % CHUNK_SIZE === 0) {
        let decryptedString = '';
        for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
          const chunk = buffer.subarray(i, i + CHUNK_SIZE);
          const dec = crypto.privateDecrypt(
            {
              key: privateKey,
              padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
              oaepHash: 'sha256',
            },
            chunk
          );
          decryptedString += dec.toString('utf8');
        }
        return decryptedString;
      }

      // Caso contrário, tenta descriptografar de uma vez só (tamanho <= 256)
      const decrypted = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        buffer
      );

      return decrypted.toString('utf8');
    } catch (err: any) {
      console.error('Erro ao descriptografar:', err.message || err);
      
      // Fallback gracioso para ambiente de desenvolvimento:
      // Se o dev enviou apenas base64/hex do texto em claro pelo Swagger, tentamos exibir
      try {
        let rawBuffer = encryptedData.startsWith('\\x') 
          ? Buffer.from(encryptedData.slice(2), 'hex') 
          : encryptedData.match(/^[0-9a-fA-F]+$/) 
            ? Buffer.from(encryptedData, 'hex') 
            : Buffer.from(encryptedData, 'base64');
            
        const str = rawBuffer.toString('utf8');
        // Se a string contiver caracteres majoritariamente legíveis, exibimos com aviso
        if (str && /^[\x20-\x7E\sÀ-ÿ\r\n]+$/.test(str.substring(0, 100))) {
          return `[AVISO DE SEGURANÇA: Este relato não foi criptografado com a chave RSA do servidor (enviado em plain-text/base64)]\n\n${str}`;
        }
      } catch (e) {}

      return '[Erro: O conteúdo é inválido ou a chave RSA do servidor não corresponde. Não foi possível descriptografar.]';
    }
  }
}
