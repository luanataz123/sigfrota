/**
 * Handler mínimo usado nos testes do construto `FuncaoLambda`.
 * Só serve para o esbuild ter um ponto de entrada real a empacotar.
 */
export async function handler(): Promise<{ statusCode: number; body: string }> {
  return { statusCode: 200, body: JSON.stringify({ ok: true }) };
}
