import { Router } from 'express';
import { CryptoService } from '../services/crypto.service';

const router = Router();

router.get('/public-key', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600'); // 1h cache
  res.json({ key: CryptoService.getPublicKey() });
});

export default router;
