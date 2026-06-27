/**
 * Serviço de consulta de endereço via ViaCEP.
 * Documentação: https://viacep.com.br
 */

export interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  unidade: string;
  bairro: string;
  localidade: string;
  uf: string;
  ibge: string;
  gia: string;
  ddd: string;
  siafi: string;
}

export interface EnderecoFormatado {
  cep: string;
  logradouro: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  estado: string;
}

/**
 * Consulta o endereço pelo CEP usando a API pública do ViaCEP.
 * @param cep CEP no formato "01310-100" ou "01310100"
 * @returns Endereço formatado ou null se não encontrado
 * @throws Error se o CEP for inválido ou a API estiver indisponível
 */
export async function fetchEnderecoByCep(cep: string): Promise<EnderecoFormatado> {
  // Remove caracteres não numéricos (traços, espaços, etc.)
  const cepNumerico = cep.replace(/\D/g, '');

  if (cepNumerico.length !== 8) {
    throw new Error('CEP inválido: deve conter exatamente 8 dígitos');
  }

  const response = await fetch(`https://viacep.com.br/ws/${cepNumerico}/json/`);

  if (!response.ok) {
    throw new Error(`Erro ao consultar ViaCEP: status ${response.status}`);
  }

  const data = await response.json() as ViaCepResponse & { erro?: boolean };

  if (data.erro) {
    throw new Error(`CEP ${cep} não encontrado`);
  }

  return {
    cep: data.cep,
    logradouro: data.logradouro,
    complemento: data.complemento || undefined,
    bairro: data.bairro,
    cidade: data.localidade,
    estado: data.uf,
  };
}
