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

/** Arquivo já gravado no Storage, pronto para /api/mrp/import/inspect. */
export type MrpUploadedFileRef = { fileName: string; filePath: string; bucket: string; fileSize: number; mimeType: string };
export type MrpUploadStage = "read" | "prepare" | "upload";
export type MrpUploadResult = { ok: true; refs: MrpUploadedFileRef[] } | { ok: false; stage: MrpUploadStage; error: string };

/**
 * Envia as planilhas ao Storage (upload-url → PUT na URL assinada).
 *
 * Cada arquivo é LIDO PARA A MEMÓRIA logo na seleção, antes de qualquer
 * chamada: o navegador só lê o arquivo no momento do PUT, e se ele mudar no
 * disco nesse intervalo (OneDrive sincronizando, Excel salvando/bloqueando) o
 * Chrome aborta o envio com net::ERR_UPLOAD_FILE_CHANGED — que aparecia na tela
 * só como "Failed to fetch". Erros saem com a etapa e texto amigável, nunca
 * com URL assinada, token ou chave.
 */
export async function mrpUploadFiles(files: File[]): Promise<MrpUploadResult> {
  const snapshots: { file: File; bytes: ArrayBuffer }[] = [];
  for (const file of files) {
    try {
      snapshots.push({ file, bytes: await file.arrayBuffer() });
    } catch {
      return {
        ok: false,
        stage: "read",
        error: `Não foi possível ler o arquivo ${file.name}. Feche-o no Excel e, se ele estiver numa pasta do OneDrive, aguarde a sincronização terminar e selecione-o de novo.`
      };
    }
  }
  const refs: MrpUploadedFileRef[] = [];
  for (const { file, bytes } of snapshots) {
    const signed = await mrpPost<{ uploadUrl: string; path: string; bucket: string; contentType: string; apiKey: string }>("/api/mrp/import/upload-url", { fileName: file.name });
    if (!signed.ok) return { ok: false, stage: "prepare", error: `Falha ao preparar o upload da planilha ${file.name}: ${signed.error}` };
    let put: Response;
    try {
      put = await fetch(signed.data.uploadUrl, {
        method: "PUT",
        headers: { "content-type": signed.data.contentType, apikey: signed.data.apiKey, "x-upsert": "false" },
        body: new Blob([bytes], { type: signed.data.contentType })
      });
    } catch {
      return {
        ok: false,
        stage: "upload",
        error: `Não foi possível enviar o arquivo ${file.name} ao Storage (sem resposta do armazenamento). Verifique a conexão e tente novamente.`
      };
    }
    if (!put.ok) return { ok: false, stage: "upload", error: `Não foi possível enviar o arquivo ${file.name} ao Storage (HTTP ${put.status}).` };
    refs.push({ fileName: file.name, filePath: signed.data.path, bucket: signed.data.bucket, fileSize: bytes.byteLength, mimeType: signed.data.contentType });
  }
  return { ok: true, refs };
}
