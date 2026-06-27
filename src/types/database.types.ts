// ── Tipos de domínio baseados no schema do banco ──────────────────────────

export type UserTipo = 'PAI' | 'ALUNO' | 'ACADEMIA' | 'ADMIN';
export type SeloNivel = 'NENHUM' | 'BRONZE' | 'PRATA' | 'OURO';
export type CursoTipo = 'PROTECAO_MENORES' | 'PREVENCAO_ASSEDIO' | 'INCLUSAO' | 'OUTRO';
export type DenunciaTipo = 'ASSEDIO_SEXUAL' | 'ASSEDIO_MORAL' | 'VIOLENCIA' | 'OUTRO';
export type DenunciaStatus = 'RECEBIDA' | 'TRIAGEM' | 'EM_APURACAO' | 'ENCERRADA';
export type Urgencia = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type Atividade = 'JIU_JITSU' | 'MUAY_THAI' | 'BOXE' | 'FUNCIONAL';

export const ATIVIDADES_VALIDAS: Atividade[] = ['JIU_JITSU', 'MUAY_THAI', 'BOXE', 'FUNCIONAL'];

export interface User {
  id: string;
  auth_id: string;
  tipo: UserTipo;
  nome?: string | null;
  email?: string | null;
  telefone?: string | null;
  criado_em: string;
  academia?: Academia | null;
}

export interface Academia {
  id: string;
  user_id: string;
  nome: string;
  cnpj?: string | null;
  endereco: Record<string, any>;
  telefone?: string | null;
  instagram?: string | null;
  descricao?: string | null;
  foto_url?: string | null;
  atividades: Atividade[];
  nivel_selo: SeloNivel;
  verificada: boolean;
  ativa: boolean;
  criado_em: string;
  atualizado_em: string;
  certificados?: Certificado[];
  avaliacoes?: Avaliacao[];
}

export interface Certificado {
  id: string;
  academia_id: string;
  tipo: CursoTipo;
  instrutor: string;
  emitido_em: string;
  validade_em: string;
  url_pdf?: string | null;
  academia?: Pick<Academia, 'nome' | 'cnpj'>;
}

export interface Avaliacao {
  id: string;
  academia_id: string;
  user_id: string;
  nota: number;
  categorias: Record<string, any>;
  comentario?: string | null;
  criado_em: string;
  user?: Pick<User, 'nome'>;
}

export interface Denuncia {
  id: string;
  protocolo: string;
  tipo: DenunciaTipo;
  descricao_enc: string; // bytea serializado como base64 no Supabase
  academia_ref?: string | null;
  status: DenunciaStatus;
  urgencia: Urgencia;
  envolve_menor: boolean;
  criado_em: string;
  atualizado_em: string;
  historico?: DenunciaHistorico[];
}

export interface DenunciaHistorico {
  id: string;
  denuncia_id: string;
  status_de: DenunciaStatus;
  status_para: DenunciaStatus;
  nota_interna?: string | null;
  operador_id: string;
  criado_em: string;
}
