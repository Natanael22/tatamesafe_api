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
}
