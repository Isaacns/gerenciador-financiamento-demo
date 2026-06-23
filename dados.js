/* VIZIO · Gerenciador de Financiamento — MODELO VAZIO (instância de testes)
   Sem nenhum dado. Use "Gerenciar dados" em cada módulo para incluir registros,
   ou substitua este arquivo por um gerado no Configurador. */
const DADOS = {
  _meta: { produto: "Gerenciador de Financiamento", imovel: "Instância de Testes", fonte: "Modelo vazio", gerado: "23/06/2026" },
  _cfg:  { produto: "Gerenciador de Financiamento", instancia: "Instância de Testes", propLabel: "Proprietário" },
  _users: [
    { user: "admin", pass: "admin", nome: "Administrador", perfil: "admin" },
    { user: "teste", pass: "teste", nome: "Usuário Teste", perfil: "proprietario", roleLabel: "Proprietário" }
  ],
  resumo: { entradaPago:0, entradaPrev:0, entradaPct:0, docPago:0, docPrev:0, docPct:0, jurosPago:0, jurosPrev:0, jurosPct:0, finSaldo:0, totalInvestido:0, custoTotal:0, faltaPagar:0 },
  finMeta: { saldoInicial:0, jurosMensal:0, totalPago:0, saldoAtual:0, parcelasPagas:0, parcelasRestantes:0, pctQuitado:0 },
  sim: { aporteExtra:200, aporteUnico:0, juros:0.006, parcela:1000, saldo:0, mesesBase:0, mesesSim:0, jurosBase:0, jurosSim:0, totalBase:0, totalSim:0 },
  entrada: [],
  doc: [],
  juros: [],
  fin: [],
  desembolso: []
};
