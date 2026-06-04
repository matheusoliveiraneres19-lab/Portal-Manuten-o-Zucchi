# Importacao Excel, SAP e Fiori

Este documento define a base tecnica para futuras importacoes do Portal de Gestao da Manutencao Zucchi. A implementacao de upload ainda nao faz parte desta fase.

## Tipos de Importacao

- Ordens de Servico
- Compras
- Materiais
- Lubrificantes
- Horas apontadas
- Equipamentos
- Procedimentos

## Ordens de Servico

Colunas esperadas:

- numero_os
- titulo
- descricao
- tipo_manutencao
- area
- status
- prioridade
- responsavel
- codigo_equipamento
- data_abertura
- data_fechamento
- horas_parada
- horas_trabalhadas
- causa_falha
- solucao
- origem

Regra de duplicidade: `numero_os` deve ser tratado como chave natural. Uma OS ja existente deve ser atualizada, nao duplicada.

## Compras

Colunas esperadas:

- item
- codigo_material
- fornecedor
- status
- prioridade
- quantidade
- valor_unitario
- valor_total
- data_solicitacao
- data_compra
- previsao_entrega
- solicitante
- codigo_equipamento

Regra de duplicidade: quando houver codigo de compra futuro, usar como chave. Enquanto nao existir, validar combinacao de `item`, `fornecedor`, `data_solicitacao` e `valor_total`.

## Materiais

Colunas esperadas:

- codigo
- nome
- categoria
- unidade
- estoque_atual
- estoque_minimo
- valor_medio
- criticidade

Regra de duplicidade: `codigo` e chave natural.

## Lubrificantes

Colunas esperadas:

- codigo
- nome
- tipo
- unidade
- estoque_atual
- estoque_minimo
- tipo_movimento
- quantidade
- data_movimento
- responsavel
- observacao
- codigo_equipamento

Regra de quantidade: quantidades devem ser positivas. O campo `tipo_movimento` define se a movimentacao e `COMPRA`, `CONSUMO` ou `AJUSTE`.

## Horas Apontadas

Colunas esperadas:

- usuario
- login_usuario
- numero_os
- data
- horas
- meta_semanal
- meta_mensal
- observacao

Regra de conversao de horas:

- `42` vira `42`
- `1,5` vira `1.5`
- `01:30` vira `1.5`
- `2h` vira `2`

Regra de duplicidade: validar combinacao de `usuario`, `numero_os` e `data`.

## Equipamentos

Colunas esperadas:

- codigo
- nome
- setor
- localizacao
- fabricante
- modelo
- status
- criticidade

Regra de duplicidade: `codigo` e chave natural.

## Procedimentos

Colunas esperadas:

- titulo
- descricao
- categoria
- versao
- url_arquivo
- ativo
- responsavel

Regra de duplicidade: validar combinacao de `titulo`, `categoria` e `versao`.

## Normalizacao

Os nomes de colunas devem passar por `normalizarNomeColuna`, removendo acentos, espacos duplicados e caracteres especiais. Exemplos:

- `Numero OS` vira `numero_os`
- `Data de Abertura` vira `data_de_abertura`
- `Previsao Entrega` vira `previsao_entrega`

## Regras de Quantidade

Para materiais e lubrificantes:

- valores importados devem ser convertidos com `converterNumeroBrasileiro`;
- quantidade final deve ser positiva;
- entrada, saida, compra, consumo e ajuste devem ser identificados por tipo de movimento;
- o banco deve manter quantidade positiva e o tipo deve indicar a natureza da movimentacao.

## Historico de Importacao

Toda importacao futura deve gravar um registro em `ImportHistory`, contendo:

- `type`
- `fileName`
- `importedBy`
- `totalRows`
- `createdRows`
- `updatedRows`
- `errorRows`
- `status`
- `errorMessage`

Estados recomendados:

- `EM_PROCESSAMENTO`
- `SUCESSO`
- `PARCIAL`
- `ERRO`

## Fluxo Futuro

1. Upload da planilha.
2. Leitura das abas e linhas.
3. Normalizacao de nomes de colunas.
4. Conversao de datas, numeros e horas.
5. Padronizacao de status, tipos e criticidades.
6. Validacao linha a linha.
7. Upsert no banco evitando duplicidades.
8. Registro do resultado em `ImportHistory`.
9. Retorno de resumo com erros e avisos para o usuario.
