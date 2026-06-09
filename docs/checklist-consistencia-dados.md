# Checklist de Consistência de Dados — Portal Zucchi

Roteiro de testes manuais para garantir que dashboard e páginas internas leem da
mesma fonte e refletem importações/alterações automaticamente.

> Pré-requisito: rodar com banco real (`npm run build && npm run start`).
> Cookie de sessão de teste: `zucchi-auth=mock`.

## A. Ordens de Serviço

- [ ] 1. Importar planilha de Ordens de Serviço.
- [ ] 2. Página **Ordens de Serviço**: conferir o total de OS.
- [ ] 3. Dashboard: conferir **OS Abertas** (deve usar os status
      `ABERTA, LIBERADA, EM_ANDAMENTO, AGUARDANDO_MATERIAL` — mesma regra única).
- [ ] 4. Conferir **Top equipamentos críticos** (dashboard e Equipamentos Críticos
      devem ranquear os mesmos equipamentos).
- [ ] 5. Conferir **Horas por colaborador** (dashboard usa `TimeEntry`, com
      fallback para `ServiceOrder.workedHours`).

## B. Lubrificantes

- [ ] 6. Importar planilha de Lubrificantes.
- [ ] 7. Dashboard: conferir **Consumo de Lubrificantes** (soma de `SAIDA`).
- [ ] 8. Página **Lubrificantes**: conferir saídas no mês/ano e itens abaixo do
      mínimo; gerar alertas de reposição e ver se o painel de Alertas reflete.

## C. Compras

- [ ] 9. Importar/atualizar Compras.
- [ ] 10. Dashboard: conferir **Compras Pendentes** (status
      `SOLICITADA, EM_COTACAO, APROVADA, ATRASADA`) e a tabela de pendentes.
- [ ] 11. Conferir **Alertas** (ex.: compra com previsão vencida →
      candidato a `COMPRA_ATRASADA` em `derived-alerts.service`).

## D. Período global

- [ ] 12. Alterar o período global no header (ex.: `01/05/2026` a `04/06/2026`).
- [ ] 13. Confirmar que **todas** as páginas respeitam o período:
  - [ ] Dashboard (KPIs e gráficos filtrados);
  - [ ] Ordens de Serviço (filtro por `openedAt`);
  - [ ] Equipamentos Críticos (filtro por `openedAt`);
  - [ ] Lubrificantes (referência mês/ano derivada do fim da janela global).

## E. Estados vazios (sem número falso)

- [ ] 14. Com um período sem dados, confirmar que KPIs mostram "0" + aviso e que
      gráficos/tabelas mostram **empty state** (nunca números inventados).

## F. Atualização automática

- [ ] 15. Após qualquer importação, confirmar que o portal atualiza via
      `usePortalDataRefresh()` (router.refresh) sem precisar recarregar a página
      manualmente.
