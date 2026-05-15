import { Request, Response, NextFunction } from 'express';

// Exemplo básico usando um middleware customizado para Supabase JWT
// Para uma integração real, você validaria a assinatura JWT localmente
// ou usando @supabase/supabase-js

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    // Validar token com jwt.verify usando JWT_SECRET ou chave pública do Supabase
    // req.user = decodedToken;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};
