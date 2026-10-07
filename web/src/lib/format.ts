// lib/format.ts
//
// Utilitários puros de formatação e parse para EXIBIÇÃO (Req. 2.3, 2.4, 7.2).
//
// Diferença importante vs. `components/MoneyInput.tsx`:
//  - `MoneyInput` (parseValorMonetario / formatarValorMonetario) é para EDIÇÃO:
//    produz/consome texto SEM o símbolo "R$" (ex.: "1.234,50").
//  - Este módulo é para EXIBIÇÃO: `formatarMoeda` inclui o símbolo "R$" e
//    `formatarValorLavagem` exibe "—" para lavagem interna (sem valor).
//
// Datas trafegam/armazenam em ISO `YYYY-MM-DD` (contrato da API) e são exibidas
// em `DD/MM/AAAA` (Req. 2.3). O formulário faz o caminho inverso ao enviar
// (Req. 7.2). Funções puras, sem dependência de fuso horário (operam sobre a
// string, não sobre `Date`), para evitar deslocamento de dia.

/** Placeholder exibido quando não há valor (lavagem interna). */
export const SEM_VALOR = '—';

const RE_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_BR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/**
 * Verifica se ano/mês/dia formam uma data de calendário real (rejeita 31/02,
 * 00/00/0000, mês 13 etc.). Faz round-trip por `Date` em UTC para confirmar que
 * os componentes não "transbordaram" (ex.: 31/04 vira 01/05).
 */
function ehDataValida(ano: number, mes: number, dia: number): boolean {
  if (mes < 1 || mes > 12) return false;
  if (dia < 1 || dia > 31) return false;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    d.getUTCFullYear() === ano &&
    d.getUTCMonth() === mes - 1 &&
    d.getUTCDate() === dia
  );
}

/**
 * ISO `YYYY-MM-DD` → exibição `DD/MM/AAAA` (Req. 2.3).
 *
 * Entrada vazia/`null`/`undefined` retorna string vazia (seguro para render).
 * Entrada com formato ou data inválida (ex.: `2024-02-31`) também retorna
 * string vazia, para não quebrar a listagem.
 */
export function isoParaBr(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = RE_ISO.exec(iso.trim());
  if (!m) return '';
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (!ehDataValida(ano, mes, dia)) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * Exibição `DD/MM/AAAA` → ISO `YYYY-MM-DD` (Req. 7.2).
 *
 * Entrada vazia/`null`/`undefined` retorna string vazia. Formato ou data
 * inválida (ex.: `31/02/2024`) retorna string vazia — o formulário trata o erro
 * de data pela validação de domínio (R15); aqui apenas evitamos produzir ISO
 * malformado para o payload.
 */
export function brParaIso(br: string | null | undefined): string {
  if (!br) return '';
  const m = RE_BR.exec(br.trim());
  if (!m) return '';
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (!ehDataValida(ano, mes, dia)) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

const formatadorMoeda = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Formata um número como moeda BRL para exibição (ex.: 1234.5 → "R$ 1.234,50").
 * Entrada inválida (`NaN`) cai para 0 formatado, evitando render de "R$ NaN".
 */
export function formatarMoeda(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return formatadorMoeda.format(n);
}

/**
 * Valor da lavagem na listagem (Req. 2.4): lavagem interna não tem valor, então
 * exibimos "—" em vez de "R$ 0,00". `undefined`/`null`/`NaN` → "—"; caso
 * contrário, formata em BRL.
 */
export function formatarValorLavagem(valor: number | null | undefined): string {
  if (valor === undefined || valor === null || Number.isNaN(valor)) {
    return SEM_VALOR;
  }
  return formatarMoeda(valor);
}

const formatadorKm = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

/**
 * Odômetro inteiro com separador de milhar pt-BR (ex.: 45210 → "45.210").
 * Arredonda para inteiro; entrada inválida (`NaN`) retorna string vazia.
 */
export function formatarKm(km: number): string {
  if (!Number.isFinite(km)) return '';
  return formatadorKm.format(Math.round(km));
}
