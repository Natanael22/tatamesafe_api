"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CryptoService = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
class CryptoService {
    static publicKey = null;
    static privateKey = null;
    static initializeKeys() {
        const keyPath = process.env.RSA_PRIVATE_KEY_PATH
            ? path_1.default.resolve(process.env.RSA_PRIVATE_KEY_PATH)
            : path_1.default.join(__dirname, '../../keys/rsa_private.pem');
        const pubPath = keyPath.replace('private', 'public');
        if (fs_1.default.existsSync(keyPath) && fs_1.default.existsSync(pubPath)) {
            this.privateKey = fs_1.default.readFileSync(keyPath, 'utf8');
            this.publicKey = fs_1.default.readFileSync(pubPath, 'utf8');
        }
        else {
            console.warn(`Chaves RSA não encontradas no disco. Gerando e persistindo novo par de chaves em: ${keyPath}`);
            try {
                const dir = path_1.default.dirname(keyPath);
                if (!fs_1.default.existsSync(dir)) {
                    fs_1.default.mkdirSync(dir, { recursive: true });
                }
                const { publicKey, privateKey } = crypto_1.default.generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
                });
                fs_1.default.writeFileSync(keyPath, privateKey, 'utf8');
                fs_1.default.writeFileSync(pubPath, publicKey, 'utf8');
                this.privateKey = privateKey;
                this.publicKey = publicKey;
            }
            catch (err) {
                console.error('Erro ao salvar as chaves RSA geradas no disco. Usando chaves efêmeras em memória...', err);
                const { publicKey, privateKey } = crypto_1.default.generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: { type: 'spki', format: 'pem' },
                    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
                });
                this.publicKey = publicKey;
                this.privateKey = privateKey;
            }
        }
    }
    static getPublicKey() {
        if (!this.publicKey)
            this.initializeKeys();
        return this.publicKey;
    }
    // Apenas usado no admin panel (se este backend rodar o admin panel)
    // Na arquitetura real de segurança máxima, a API principal NEM TEM a private key
    static getPrivateKey() {
        if (!this.privateKey)
            this.initializeKeys();
        return this.privateKey;
    }
}
exports.CryptoService = CryptoService;
