import 'dotenv/config';
import app from './app';
import { StorageService } from './lib/storage';

const REQUIRED_ENV = ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Variável de ambiente obrigatória ausente: ${key}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Garante a criação dos buckets no Supabase Storage
  await StorageService.ensureBucketsExist();
});
