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
        // For MVP, we load from file or generate ephemeral
        const keyPath = process.env.RSA_PRIVATE_KEY_PATH || path_1.default.join(__dirname, '../../keys/rsa_private.pem');
        const pubPath = keyPath.replace('private', 'public');
        if (fs_1.default.existsSync(keyPath) && fs_1.default.existsSync(pubPath)) {
            this.privateKey = fs_1.default.readFileSync(keyPath, 'utf8');
            this.publicKey = fs_1.default.readFileSync(pubPath, 'utf8');
        }
        else {
            console.warn('Chaves RSA não encontradas. Gerando par de chaves efêmero em memória para desenvolvimento...');
            const { publicKey, privateKey } = crypto_1.default.generateKeyPairSync('rsa', {
                modulusLength: 2048,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
            });
            this.publicKey = publicKey;
            this.privateKey = privateKey;
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
