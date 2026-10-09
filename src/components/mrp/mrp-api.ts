/**
 * Cliente das rotas /api/mrp/* (navegador). Normaliza os dois formatos de erro
 * do portal ({ success:false, error } das rotas e { ok:false, message } do
 * middleware) numa mensagem só.
 */
export type MrpApiResult<T> = { ok: true; data: T } | { ok: false; error: string; details?: string; status: number };

async function read<T>(response: Response): Promise<MrpApiResult<T>> {
  const text = await response.text();
  let body: Record<string, unknown> | null = null;
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    body = null;
  }
  if (response.ok && body && body.success === true) return { ok: true, data: body.data as T };
  const error =
    (typeof body?.error === "string" && body.error) ||
    (typeof body?.message === "string" && body.message) ||
    (response.status === 413 ? "Arquivo grande demais para esta rota." : `Erro ${response.status} ao falar com o portal.`);
  return { ok: false, error, details: typeof body?.details === "string" ? body.details : undefined, status: response.status };
}

export async function mrpGet<T>(url: string, signal?: AbortSignal): Promise<MrpApiResult<T>> {
  try {
    return await read<T>(await fetch(url, { cache: "no-store", signal }));
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return { ok: false, error: "Falha de rede ao falar com o portal.", status: 0 };
  }
}

export async function mrpPost<T>(url: string, body: unknown): Promise<MrpApiResult<T>> {
  try {
    return await read<T>(
      await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    );
  } catch {
    return { ok: false, error: "Falha de rede ao falar com o portal. Verifique a conexão e tente novamente.", status: 0 };
  }
}
