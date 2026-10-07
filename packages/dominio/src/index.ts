// @sigfrota/dominio — fonte única das regras de validação da Lavagem.
//
// STUB do módulo de domínio compartilhado. A mesma assinatura (`validarLavagem`)
// será reutilizada pelo backend (Lambda); por isso a UI NÃO reimplementa as
// regras — apenas liga/desliga campos e exibe erros (ver design.md, "Fonte única
// de regras"). Este arquivo implementa R02–R04 e R09–R15 do gabarito
// (docs/lavagem-gabarito-regras.md), a ser substituído pelo módulo real quando
// existir.
//
// Rastreabilidade das regras implementadas aqui:
//   R02 — obrigatórios base: tipo de lavagem, data e km.
//   R03 — valor, se informado, deve ser > 0.
//   R04 — odômetro (km) deve ser > 0.
//   R09 — propriaUnidade 'S' (interna, default) ou 'N' (externa).
//   R10 — interna dispensa valor/posto (não valida esses campos).
//   R11 — externa exige valor (> 0 por R03).
//   R12 — externa: postoConveniado 'S' (default) ou 'N'.
//   R13 — externa + conveniado → idPosto obrigatório.
//   R14 — externa + não conveniado → dsPosto e cnpjPosto obrigatórios.
//   R15 — data deve ser uma data real no formato ISO YYYY-MM-DD.

export type SimNao = 'S' | 'N';

/**
 * Valores da lavagem avaliados pelo domínio. É um recorte parcial da entidade
 * `Lavagem` do contrato: `idVeiculo` e metadados (R08) são responsabilidade do
 * contexto/backend e não são validados no formulário.
 */
export interface LavagemInput {
  idTipoLavagem?: number | null;
  dtLavagem?: string | null; // ISO YYYY-MM-DD
  kmLavagem?: number | null;
  propriaUnidade?: SimNao | null;
  vlLavagem?: number | null;
  postoConveniado?: SimNao | null;
  idPosto?: number | null;
  dsPosto?: string | null;
  cnpjPosto?: string | null;
}

/**
 * Mapa campo → mensagem de erro. Vazio (`{}`) significa que a lavagem é válida.
 * A chave é o nome do campo do formulário (ver `web/src/api/types.ts`).
 */
export type ErrosLavagem = Partial<Record<keyof LavagemInput, string>>;

// Mensagens em português, claras para o atendente.
export const MENSAGENS = {
  obrigatorio: 'Campo obrigatório',
  kmMaiorQueZero: 'Odômetro deve ser maior que zero',
  valorObrigatorio: 'Informe o valor da lavagem',
  valorMaiorQueZero: 'Valor deve ser maior que zero',
  dataInvalida: 'Data inválida',
  selecionePosto: 'Selecione um posto conveniado',
  descricaoPosto: 'Informe a descrição do posto',
  cnpjPosto: 'Informe o CNPJ do posto',
} as const;

/** Um número informado e utilizável (não nulo/indefinido e não NaN). */
function informado(n: number | null | undefined): n is number {
  return typeof n === 'number' && !Number.isNaN(n);
}

/** Uma string com conteúdo após trim. */
function preenchido(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

/**
 * Valida se `s` é uma data real no formato ISO `YYYY-MM-DD` (R15). Rejeita
 * formatos diferentes e datas inexistentes (ex.: 2026-02-31).
 */
export function dataIsoValida(s: string | null | undefined): boolean {
  if (!preenchido(s)) return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return false;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > 31) return false;
  // Confere via Date em UTC para evitar deslocamento de fuso; a data é real
  // quando os componentes "sobrevivem" à normalização.
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/**
 * Valida uma lavagem segundo as regras do gabarito (R02–R04, R09–R15).
 * Retorna um mapa campo → mensagem; `{}` quando válida.
 *
 * Fonte única: esta função é a autoridade das regras no cliente. O
 * `validationResolver` apenas adapta este retorno ao React Hook Form.
 */
export function validarLavagem(valores: LavagemInput): ErrosLavagem {
  const erros: ErrosLavagem = {};

  // R02 — obrigatórios base (tipo, data, km). idVeiculo vem do contexto.
  if (!informado(valores.idTipoLavagem)) {
    erros.idTipoLavagem = MENSAGENS.obrigatorio;
  }

  // R15 — data: obrigatória (R02) e precisa ser uma data real.
  if (!preenchido(valores.dtLavagem)) {
    erros.dtLavagem = MENSAGENS.obrigatorio;
  } else if (!dataIsoValida(valores.dtLavagem)) {
    erros.dtLavagem = MENSAGENS.dataInvalida;
  }

  // R02 + R04 — km obrigatório e > 0.
  if (!informado(valores.kmLavagem)) {
    erros.kmLavagem = MENSAGENS.obrigatorio;
  } else if (valores.kmLavagem <= 0) {
    erros.kmLavagem = MENSAGENS.kmMaiorQueZero;
  }

  // R09 — interna ('S', default) × externa ('N'). Qualquer valor diferente de
  // 'N' é tratado como interna (default do APEX era "Sim").
  const externa = valores.propriaUnidade === 'N';

  if (externa) {
    // R11 — externa exige valor; R03 — valor, se informado, > 0.
    if (!informado(valores.vlLavagem)) {
      erros.vlLavagem = MENSAGENS.valorObrigatorio;
    } else if (valores.vlLavagem <= 0) {
      erros.vlLavagem = MENSAGENS.valorMaiorQueZero;
    }

    // R12 — conveniado ('S', default) × não conveniado ('N').
    const conveniado = valores.postoConveniado !== 'N';

    if (conveniado) {
      // R13 — conveniado exige seleção de posto.
      if (!informado(valores.idPosto)) {
        erros.idPosto = MENSAGENS.selecionePosto;
      }
    } else {
      // R14 — não conveniado exige descrição e CNPJ.
      if (!preenchido(valores.dsPosto)) {
        erros.dsPosto = MENSAGENS.descricaoPosto;
      }
      if (!preenchido(valores.cnpjPosto)) {
        erros.cnpjPosto = MENSAGENS.cnpjPosto;
      }
    }
  } else {
    // R10 — interna dispensa valor/posto. Mesmo assim, R03 vale se o valor for
    // informado (campo oculto não deveria vir preenchido, mas o domínio é a
    // autoridade e não deve aceitar valor <= 0).
    if (informado(valores.vlLavagem) && valores.vlLavagem <= 0) {
      erros.vlLavagem = MENSAGENS.valorMaiorQueZero;
    }
  }

  return erros;
}
