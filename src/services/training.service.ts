import { prisma } from "@/lib/prisma";

/**
 * TREINAMENTO / LEITURA DE PROCEDIMENTOS — visão da equipe.
 *
 * Nasceu de uma auditoria: o indicador "Progresso funcionário novo" mostrava 0% e
 * ninguém sabia o que isso queria dizer. A medição no banco encontrou TRÊS coisas
 * distintas escondidas atrás do mesmo zero:
 *
 *  1. Nenhum procedimento está marcado como trilha de onboarding
 *     (`onboardingOrder` nulo nos 63 publicados) — a trilha simplesmente não existe;
 *  2. Não há NENHUMA confirmação de leitura na base (`ProcedureReadConfirmation` = 0);
 *  3. O cálculo devolvia `0` tanto para "0 de 8 lidos" quanto para "não há trilha",
 *     porque a divisão por zero caía num fallback `: 0`. Os dois casos apareciam
 *     idênticos na tela, e só um deles é cobrança de treinamento.
 *
 * Aqui os três ficam separados: `hasMandatoryTrail` diz se a trilha existe,
 * `completionRate` é null quando não há base para calcular (nunca 0), e a contagem de
 * confirmações é explícita. Nada é inventado — se ninguém leu, o número é zero mesmo,
 * e vira alerta em vez de sumir.
 */

export type TrainingProcedureRow = {
  id: string;
  title: string;
  /** Quantos usuários confirmaram leitura deste procedimento. */
  confirmations: number;
  /** confirmations ÷ usuários elegíveis × 100. null quando não há usuários. */
  completionPercent: number | null;
};

export type TrainingUserRow = {
  userId: string;
  name: string;
  email: string | null;
  mandatory: number;
  completed: number;
  pending: number;
  /** completed ÷ mandatory × 100. null quando não há procedimentos obrigatórios. */
  progressPercent: number | null;
  lastReadAt: string | null;
};

export type TrainingOverview = {
  /** Usuários com login — a base que pode confirmar leitura. */
  eligibleUsers: number;
  /** Colaboradores no cadastro (contexto: nem todo colaborador tem login). */
  registeredCollaborators: number;
  /** Procedimentos publicados. */
  publishedProcedures: number;
  /** Procedimentos marcados como obrigatórios (trilha de onboarding). */
  mandatoryProcedures: number;
  /** true quando existe trilha definida. false = não há o que cobrar ainda. */
  hasMandatoryTrail: boolean;
  /** Confirmações de leitura registradas na base inteira. */
  totalConfirmations: number;
  /** Usuários que concluíram TODOS os obrigatórios. */
  usersCompleted: number;
  /** Usuários com pelo menos um obrigatório pendente. */
  usersPending: number;
  /**
   * Taxa global = confirmações de obrigatórios ÷ (usuários × obrigatórios) × 100.
   * null quando não há trilha ou não há usuários — NUNCA 0 por ausência de base.
   */
  completionRate: number | null;
  byProcedure: TrainingProcedureRow[];
  byUser: TrainingUserRow[];
};

export async function getTrainingOverview(): Promise<TrainingOverview> {
  try {
    const [users, collaborators, published, mandatory, confirmations] = await Promise.all([
      prisma.user.findMany({ select: { id: true, name: true, email: true } }),
      prisma.collaborator.count(),
      prisma.procedure.count({ where: { status: "Publicado" } }),
      prisma.procedure.findMany({
        where: { status: "Publicado", onboardingOrder: { not: null } },
        select: { id: true, title: true, onboardingOrder: true },
        orderBy: [{ onboardingOrder: "asc" }]
      }),
      // Uma varredura só: a tabela de confirmações é pequena e alimenta os dois
      // recortes (por procedimento e por usuário) sem consulta por pessoa.
      prisma.procedureReadConfirmation.findMany({
        select: { userId: true, procedureId: true, confirmedAt: true }
      })
    ]);

    const mandatoryIds = new Set(mandatory.map((procedure) => procedure.id));
    const hasMandatoryTrail = mandatory.length > 0;

    const porProcedimento = new Map<string, number>();
    const porUsuario = new Map<string, { obrigatoriosLidos: Set<string>; ultima: Date | null }>();

    for (const confirmation of confirmations) {
      porProcedimento.set(confirmation.procedureId, (porProcedimento.get(confirmation.procedureId) ?? 0) + 1);

      const atual = porUsuario.get(confirmation.userId) ?? { obrigatoriosLidos: new Set<string>(), ultima: null };
      if (mandatoryIds.has(confirmation.procedureId)) atual.obrigatoriosLidos.add(confirmation.procedureId);
      if (!atual.ultima || confirmation.confirmedAt > atual.ultima) atual.ultima = confirmation.confirmedAt;
      porUsuario.set(confirmation.userId, atual);
    }

    const byUser: TrainingUserRow[] = users
      .map((user) => {
        const dados = porUsuario.get(user.id);
        const completed = dados?.obrigatoriosLidos.size ?? 0;
        return {
          userId: user.id,
          name: user.name ?? user.email ?? "Usuário",
          email: user.email ?? null,
          mandatory: mandatory.length,
          completed,
          pending: Math.max(0, mandatory.length - completed),
          progressPercent: hasMandatoryTrail ? Math.round((completed / mandatory.length) * 100) : null,
          lastReadAt: dados?.ultima?.toISOString() ?? null
        };
      })
      .sort((a, b) => (b.progressPercent ?? 0) - (a.progressPercent ?? 0) || a.name.localeCompare(b.name, "pt-BR"));

    const usersCompleted = hasMandatoryTrail ? byUser.filter((row) => row.pending === 0).length : 0;
    const confirmacoesObrigatorias = byUser.reduce((soma, row) => soma + row.completed, 0);
    const denominador = users.length * mandatory.length;

    return {
      eligibleUsers: users.length,
      registeredCollaborators: collaborators,
      publishedProcedures: published,
      mandatoryProcedures: mandatory.length,
      hasMandatoryTrail,
      totalConfirmations: confirmations.length,
      usersCompleted,
      usersPending: hasMandatoryTrail ? users.length - usersCompleted : 0,
      // Null quando não há base — 0% e "não dá para calcular" são coisas diferentes,
      // e foi exatamente a confusão entre as duas que motivou esta auditoria.
      completionRate: denominador > 0 ? Math.round((confirmacoesObrigatorias / denominador) * 100) : null,
      byProcedure: mandatory.map((procedure) => ({
        id: procedure.id,
        title: procedure.title,
        confirmations: porProcedimento.get(procedure.id) ?? 0,
        completionPercent:
          users.length > 0 ? Math.round(((porProcedimento.get(procedure.id) ?? 0) / users.length) * 100) : null
      })),
      byUser
    };
  } catch (error) {
    console.error("Falha ao carregar a visão de treinamento.", error);
    return {
      eligibleUsers: 0,
      registeredCollaborators: 0,
      publishedProcedures: 0,
      mandatoryProcedures: 0,
      hasMandatoryTrail: false,
      totalConfirmations: 0,
      usersCompleted: 0,
      usersPending: 0,
      completionRate: null,
      byProcedure: [],
      byUser: []
    };
  }
}
