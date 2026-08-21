import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class CryptoService {
  private static publicKey: string | null = null;
  private static privateKey: string | null = null;

  public static initializeKeys() {
    const keyPath = process.env.RSA_PRIVATE_KEY_PATH 
      ? path.resolve(process.env.RSA_PRIVATE_KEY_PATH) 
      : path.join(__dirname, '../../keys/rsa_private.pem');
    const pubPath = keyPath.replace('private', 'public');

    if (fs.existsSync(keyPath) && fs.existsSync(pubPath)) {
      this.privateKey = fs.readFileSync(keyPath, 'utf8');
      this.publicKey = fs.readFileSync(pubPath, 'utf8');
    } else {
      console.warn(`Chaves RSA não encontradas no disco. Gerando e persistindo novo par de chaves em: ${keyPath}`);
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

      // O tamanho do bloco cifrado para RSA 2048 é sempre 256 bytes
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
