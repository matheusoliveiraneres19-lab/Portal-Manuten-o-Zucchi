/**
 * Normaliza um nome de pessoa para uma chave de casamento estável:
 * minúsculo, sem acento e com espaços colapsados.
 *
 * Usado para gerar `Collaborator.nameKey` e para casar colaboradores com
 * `TimeEntry.userName` nas análises de banco de horas (mesma normalização
 * aplicada aos dois lados garante o match).
 *
 * Ex.: "  João   da Silva " -> "joao da silva"
 */
// Marcas diacríticas combinantes (U+0300–U+036F). Construído via string escapada
// para não depender de caracteres combinantes literais no fonte.
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

export function normalizeNameKey(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
