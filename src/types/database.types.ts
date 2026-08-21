// ── Tipos de domínio baseados no schema do banco ──────────────────────────

export type UserTipo = 'PAI' | 'ALUNO' | 'ACADEMIA' | 'ADMIN';
export type SeloNivel = 'NENHUM' | 'BRONZE' | 'PRATA' | 'OURO';
export type CursoTipo = 'PROTECAO_MENORES' | 'PREVENCAO_ASSEDIO' | 'INCLUSAO' | 'OUTRO';
export type DenunciaTipo = 'ASSEDIO_SEXUAL' | 'ASSEDIO_MORAL' | 'VIOLENCIA' | 'OUTRO';
export type DenunciaStatus = 'RECEBIDA' | 'TRIAGEM' | 'EM_APURACAO' | 'ENCERRADA';
export type Urgencia = 'BAIXA' | 'MEDIA' | 'ALTA' | 'CRITICA';
export type Atividade = 'JIU_JITSU' | 'MUAY_THAI' | 'BOXE' | 'FUNCIONAL';
export type EncaminhamentoTipo =
  | 'CONSELHO_TUTELAR'
  | 'DELEGACIA'
  | 'PSICOLOGO'
  | 'MINISTERIO_PUBLICO'
  | 'OUTRO';

// SLA em horas por urgência (conforme especificação técnica seção 6)
export const SLA_HORAS: Record<Urgencia, number> = {
  CRITICA: 2,
  ALTA: 8,
  MEDIA: 24,
  BAIXA: 72,
};

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
  sla_prazo?: string | null;      // Prazo SLA calculado na criação
  operador_id?: string | null;    // Operador responsável
  encaminhamento?: EncaminhamentoTipo | null; // Para onde foi encaminhada
  encaminhamento_notas?: string | null;       // Notas do encaminhamento
  criado_em: string;
  atualizado_em: string;
  historico?: DenunciaHistorico[];
  evidencias?: DenunciaEvidencia[];
  triagem?: DenunciaTriagem | null;
}

export interface DenunciaEvidencia {
  id: string;
  denuncia_id: string;
  s3_key: string;
  tipo_mime: string;
  tamanho_kb: number;
  criado_em: string;
  url?: string | null; // URL assinada temporária, gerada em runtime
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

export interface DenunciaTriagem {
  id: string;
  denuncia_id: string;
  operador_id: string;
  categoria_confirmada: DenunciaTipo;
  urgencia_confirmada: Urgencia;
  encaminhamento?: EncaminhamentoTipo | null;
  notas?: string | null;
  criado_em: string;
}

export interface DenunciaStats {
  total: number;
  por_status: Record<DenunciaStatus, number>;
  por_urgencia: Record<Urgencia, number>;
  sla_violacoes: number;       // Denúncias que já ultrapassaram o prazo SLA
  envolve_menor: number;       // Total que envolvem menor
  pendentes_triagem: number;   // Status RECEBIDA há mais de 1h
}
