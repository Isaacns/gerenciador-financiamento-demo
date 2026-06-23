# Gerenciador de Financiamento — MODELO VAZIO (testes)

Sistema completo, **sem nenhum dado**, para você testar incluindo registros do zero.

## Como usar
1. Abra o `index.html` no navegador.
2. Login de teste: **admin / admin** (gestor) ou **teste / teste** (proprietário).
3. Entre em qualquer etapa (Entrada, Documentação, Juros de Obra, Financiamento) →
   botão **Gerenciar dados** → **＋ Novo** para incluir parcelas.
4. Marque o **quadradinho "Pago?"** na tabela para quitar em 1 clique.

Os painéis começam zerados e vão se preenchendo conforme você adiciona registros
(em modo demonstração, as edições valem na sessão; conecte o backend para gravar de verdade).

## Arquivos
`index.html` · `app-crud.js` · `dados.js` (vazio) · marca VIZIO + favicons · `.nojekyll`

> Para uma instância real de um comprador, prefira o **Configurador** (`_CONFIGURADOR/configurador.html`),
> que calcula o cronograma e gera o `dados.js` já preenchido.
