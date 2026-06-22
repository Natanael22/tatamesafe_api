import supabase from './supabase';
import logger from './logger';

export class StorageService {
  private static initialized = false;

  public static async ensureBucketsExist() {
    if (this.initialized) return;

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
        const { data, error } = await supabase.storage.getBucket(bucket.name);
        if (error || !data) {
          logger.info(`Bucket "${bucket.name}" não encontrado no Supabase Storage. Criando...`);
          const { error: createError } = await supabase.storage.createBucket(bucket.name, {
            public: bucket.public,
            fileSizeLimit: 10 * 1024 * 1024, // Limite de 10MB
          });
          if (createError) {
            logger.error(createError, `Erro ao criar o bucket "${bucket.name}"`);
          } else {
            logger.info(`Bucket "${bucket.name}" criado com sucesso (${bucket.public ? 'público' : 'privado'}).`);
          }
        }
      } catch (err) {
        logger.error(err, `Erro ao verificar/criar o bucket "${bucket.name}"`);
      }
    }

    this.initialized = true;
  }

  public static async uploadFile(
    bucketName: string,
    filePath: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<string> {
    await this.ensureBucketsExist();

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      logger.error(error, `Erro ao fazer upload do arquivo "${filePath}" para o bucket "${bucketName}"`);
      throw error;
    }

    return data.path;
  }

  public static getPublicUrl(bucketName: string, filePath: string): string {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    return data.publicUrl;
  }

  public static async createSignedUrl(
    bucketName: string,
    filePath: string,
    expiresIn = 60 * 15 // 15 minutos
  ): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      logger.error(error, `Erro ao gerar URL assinada para o arquivo "${filePath}" no bucket "${bucketName}"`);
      throw error;
    }

    return data.signedUrl;
  }
}
