"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StorageService = void 0;
const supabase_1 = __importDefault(require("./supabase"));
const logger_1 = __importDefault(require("./logger"));
class StorageService {
    static initialized = false;
    static async ensureBucketsExist() {
        if (this.initialized)
            return;
        // Não rodamos em ambiente de testes para evitar erros com mocks
        if (process.env.NODE_ENV === 'test') {
            this.initialized = true;
            return;
        }
        const buckets = [
            { name: 'denuncias', public: false },
            { name: 'academias', public: true },
            { name: 'certificados', public: true },
        ];
        for (const bucket of buckets) {
            try {
                const { data, error } = await supabase_1.default.storage.getBucket(bucket.name);
                if (error || !data) {
                    logger_1.default.info(`Bucket "${bucket.name}" não encontrado no Supabase Storage. Criando...`);
                    const { error: createError } = await supabase_1.default.storage.createBucket(bucket.name, {
                        public: bucket.public,
                        fileSizeLimit: 10 * 1024 * 1024, // Limite de 10MB
                    });
                    if (createError) {
                        logger_1.default.error(createError, `Erro ao criar o bucket "${bucket.name}"`);
                    }
                    else {
                        logger_1.default.info(`Bucket "${bucket.name}" criado com sucesso (${bucket.public ? 'público' : 'privado'}).`);
                    }
                }
            }
            catch (err) {
                logger_1.default.error(err, `Erro ao verificar/criar o bucket "${bucket.name}"`);
            }
        }
        this.initialized = true;
    }
    static async uploadFile(bucketName, filePath, fileBuffer, mimeType) {
        await this.ensureBucketsExist();
        const { data, error } = await supabase_1.default.storage
            .from(bucketName)
            .upload(filePath, fileBuffer, {
            contentType: mimeType,
            upsert: true,
        });
        if (error) {
            logger_1.default.error(error, `Erro ao fazer upload do arquivo "${filePath}" para o bucket "${bucketName}"`);
            throw error;
        }
        return data.path;
    }
    static getPublicUrl(bucketName, filePath) {
        const { data } = supabase_1.default.storage.from(bucketName).getPublicUrl(filePath);
        return data.publicUrl;
    }
    static async createSignedUrl(bucketName, filePath, expiresIn = 60 * 15 // 15 minutos
    ) {
        const { data, error } = await supabase_1.default.storage
            .from(bucketName)
            .createSignedUrl(filePath, expiresIn);
        if (error) {
            logger_1.default.error(error, `Erro ao gerar URL assinada para o arquivo "${filePath}" no bucket "${bucketName}"`);
            throw error;
        }
        return data.signedUrl;
    }
}
exports.StorageService = StorageService;
