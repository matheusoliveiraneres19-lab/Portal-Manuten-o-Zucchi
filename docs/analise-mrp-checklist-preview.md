# Análise MRP — Checklist manual no Preview (FASE K.1)

Valida o caminho real de produção, todo pelo navegador e pelo Storage do Supabase:

`navegador → upload-url → Supabase Storage → inspect → preview → confirm → update-all`

O Preview tem *Deployment Protection* (SSO da Vercel). O teste é feito por um responsável **logado na Vercel e no portal** (perfil ADMIN ou GESTOR).

> **O Preview usa o mesmo banco da produção.** A análise criada aqui fica gravada e vira a análise vigente da Análise MRP. A decisão de mantê-la ou removê-la vem depois da verificação.

## Antes de começar

- **Arquivos originais**, sem abrir e salvar de novo no Excel:
  - `Controle_MRP_SAP_novo_analisado.xlsx` (OneDrive › Manutenção › MRP Sap novo);
  - `estoque 0810.xlsx` (Downloads);
  - `compras 0810.xlsx` (Downloads).
- **Endereço do Preview:** `https://project-9xvus-git-feat-analise-mrp-zucchi-manut.vercel.app/dashboard/analise-mrp`. Se esse endereço não abrir, use o link "Visit" do último deploy da branch `feat/analise-mrp` na Vercel.
- **Cronômetro:** deixe um à mão. Se quiser mais precisão, abra o DevTools (F12) › aba **Rede**.
- **Atualizar tudo:** não rode nenhum outro antes de avisar que terminou.

## Passos

| # | Ação | Resultado esperado | Anotar |
|---|---|---|---|
| 1 | Abrir **Análise MRP** no Preview | Página carrega; menu mostra "Análise MRP" | tempo de carregamento |
| 2 | Clicar em **Atualizar planilhas** | Modal "Enviar planilhas do SAP" | — |
| 3 | No campo **Depósito**, digitar **1000** (não 1400) | — | — |
| 4 | Arrastar os **3 arquivos juntos** para o modal | **Slot 1 (Planilha do MRP):** Controle_MRP_SAP_novo_analisado.xlsx, ~4.259 materiais, abas Manutenção (Mecânica) e Eletrica (Elétrica), Gyan ignorada<br>**Slot 2 (Estoque):** estoque 0810.xlsx, depósito 1000, 38 linhas<br>**Slot 3 (Compras):** compras 0810.xlsx, 1.526 linhas | tempo do envio até os 3 slots preenchidos; qualquer erro (ex.: "Armazenamento de importações não configurado") |
| 5 | Conferir a trava | Mensagem de "prontas" e botão **Atualizar tudo** habilitado | — |
| 6 | Clicar em **Atualizar tudo** e cronometrar | Aviso "Análise MRP atualizada com sucesso." e o modal fecha | **tempo total**; se der erro, o texto exato |
| 7 | **Comprar**: conferir os 6 KPIs | Comprar **880** · Verificar **0** · Em trânsito **46** · Qtd. sugerida **25.064** · Sem necessidade **3.333** · Analisados **4.259** | print da tela |
| 8 | **Áreas & Conjuntos** | Mecânica **3.465** (Comprar 720 · Em trânsito 36 · Qtd. 20.921)<br>Elétrica **794** (Comprar 160 · Em trânsito 10 · Qtd. 4.143)<br>Total **4.259** (Comprar 880 · Em trânsito 46 · Qtd. 25.064) | tempo de carregamento |
| 9 | **Em trânsito** | Linhas de compra **1.526** · Em trânsito **191** · Qtd. em trânsito **2.496,97** · Recebidos **781** · Saíram do MRP **46** (1.264 de qtd. evitada) | tempo de carregamento |
| 10 | **Estoque parado** | Sem movimentação **3.333** (78,3% da base) · Com saldo **0** · Qtd. parada **0** · Zerados **3.333** | tempo de carregamento |
| 11 | **Base MRP** | "Planilha enviada: Controle_MRP_SAP_novo_analisado.xlsx" · 4.259 materiais (Mecânica 3.465 · Elétrica 794) | tempo de carregamento |
| 12 | Voltar em **Comprar** e clicar em **Excel da lista** | Baixa `Lista_Compra_MRP_AAAAMMDD.xlsx`; abre no Excel com a aba "Lista de compra" e 880 linhas | tempo até o download |
| 13 | Recarregar (F5) duas abas quaisquer | Mesmos números | se alguma aba levar **mais de 5 s de forma repetida** |

**Se qualquer número dos passos 7–11 for diferente, pare e me avise.** Não tente corrigir.

## Depois

1. Avise que terminou e me envie:
   - os tempos;
   - os prints dos passos 7–11;
   - qualquer mensagem de erro.
2. Eu rodo, só leitura:

   ```
   npx tsx scripts/mrp/verify-preview-run.ts --direct
   ```

   Ele confere direto no banco:
   - **Storage real:** bucket e caminho de importações; tamanho dos 3 arquivos igual aos originais.
   - **KPIs e áreas:** batem com as referências oficiais.
   - **Itens:** os 4.259 itens gravados são iguais à análise do HTML original sobre os mesmos arquivos.
   - **Auditoria:** registro `mrp_update_success` com run anterior/novo, tempos da análise e duração da rota, comparada ao limite da função.
   - **Saúde do banco:** 0 locks, importações presas ou runs incompletos.
3. **Limite da função:** a rota `update-all` declara `maxDuration = 300`. O limite efetivo depende do plano da Vercel (Settings › Functions). Informe o valor se souber.

## Rollback

Não é executado no Preview: não existe hoje um jeito seguro de forçar uma falha entre a gravação das fontes e a ativação da análise, e não foi criada injeção de falha. Ele está comprovado com os arquivos reais pelos mesmos serviços que a rota usa (`scripts/mrp/validate-mrp-real-db.ts --setup`, seção 5).

Se uma falha real acontecer no Preview:
- a tela mostra "Os arquivos foram importados, mas a nova análise não pôde ser aplicada. A análise anterior continua vigente.";
- a auditoria registra `mrp_update_failed` (etapa `analysis`) com as fontes, que ficam no histórico sem uso.
