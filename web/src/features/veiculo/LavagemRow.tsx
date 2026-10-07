// features/veiculo/LavagemRow.tsx
//
// Linha da lista de lavagens do painel do veículo (R20 / Req. 2.3, 2.4; R21 /
// Req. 3.3). Renderiza uma `<tr>` com as colunas:
//  - Tipo de Lavagem: descrição do tipo (DS_TIPO_LAVAGEM) resolvida pelo
//    `idTipoLavagem` via o mapa de tipos recebido do painel (R20).
//  - Data: ISO `YYYY-MM-DD` → `DD/MM/AAAA` (lib/format.isoParaBr — Req. 2.3).
//  - Odômetro (Km): inteiro com separador de milhar (formatarKm — Req. 2.3).
//  - Valor: BRL; lavagem interna (sem valor) exibe "—" (formatarValorLavagem —
//    R10 / Req. 2.4).
// e uma coluna de ação com o LINK de edição para
// `/veiculos/:idVeiculo/lavagens/:idLavagem` (R21 / Req. 3.3), operável por
// teclado (é um `<Link>` âncora nativo).
//
// A linha é "burra": recebe a lavagem e o mapa de tipos já resolvido do painel,
// mantendo o fetch de tipos no `PainelLavagens` (uma única query para a lista).

import { Link } from 'react-router-dom';
import type { Lavagem } from '../../api/types';
import { formatarKm, formatarValorLavagem, isoParaBr } from '../../lib/format';

export interface LavagemRowProps {
  /** A lavagem a exibir. */
  lavagem: Lavagem;
  /**
   * Mapa `idTipoLavagem → descrição` (DS_TIPO_LAVAGEM) para resolver a coluna
   * "Tipo de Lavagem". Enquanto os tipos ainda carregam, o mapa pode não ter a
   * chave; nesse caso exibimos um fallback discreto.
   */
  tipos: Map<number, string>;
}

/** Fallback da coluna de tipo quando a descrição ainda não foi carregada. */
const TIPO_PENDENTE = '—';

/**
 * Uma linha (`<tr>`) do histórico de lavagens. Deve ser renderizada dentro de
 * um `<tbody>` de uma tabela com os cabeçalhos correspondentes (ver
 * `PainelLavagens`).
 */
export function LavagemRow({ lavagem, tipos }: LavagemRowProps) {
  const descricaoTipo = tipos.get(lavagem.idTipoLavagem) ?? TIPO_PENDENTE;
  const dataBr = isoParaBr(lavagem.dtLavagem);
  const km = formatarKm(lavagem.kmLavagem);
  const valor = formatarValorLavagem(lavagem.vlLavagem);

  return (
    <tr className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
      <td className="px-4 py-3 text-sm text-slate-800">{descricaoTipo}</td>
      <td className="px-4 py-3 text-sm text-slate-800">{dataBr}</td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-800">
        {km}
      </td>
      <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-800">
        {valor}
      </td>
      <td className="px-4 py-3 text-right text-sm">
        <Link
          to={`/veiculos/${lavagem.idVeiculo}/lavagens/${lavagem.idLavagem}`}
          className="rounded font-medium text-slate-700 underline underline-offset-2 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
          aria-label={`Editar lavagem de ${dataBr || 'data não informada'}`}
        >
          Editar
        </Link>
      </td>
    </tr>
  );
}
