import 'dotenv/config';
import app from './app';
import { StorageService } from './lib/storage';

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  // Garante a criação dos buckets no Supabase Storage
  await StorageService.ensureBucketsExist();
});
