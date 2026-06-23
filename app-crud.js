/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Cadastro/Edição + Relatórios
 * Carregado depois do dados.js e do script principal do index.html.
 * - Barra por módulo: Painel · Gerenciar dados · Relatório PDF
 * - Gerenciar dados: tabela editável (marcar pago em 1 clique) + Novo/Editar/Excluir
 * - Valores em R$ 1.234,56 (entrada e exibição). Datas com seletor. Pago? como checkbox.
 * - Grava no Google Sheets via Apps Script (quando API_URL estiver configurada)
 * =========================================================================== */
(function(){
"use strict";

/* >>> Backend (Apps Script) — vazio = modo demonstração (edições valem na sessão). <<< */
var API_URL = "https://script.google.com/macros/s/AKfycbxrOR7LZBG-r5RYLDKNYnUS8axM1le2IuRa8ZrD4zdA-najiCZ-5AwplHnmAFVkW6ZR/exec";

/* ---------- formatação / parsing de valores e datas ---------- */
function moneyFmt(n){ return (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function BRL(v){ return (v==null||v==="")?"—":"R$ "+moneyFmt(v); }
function moneyParse(s){
  if(s==null||s==="") return null;
  s=String(s).replace(/[^\d.,-]/g,"");
  if(s.indexOf(",")>=0) s=s.replace(/\./g,"").replace(",","."); // BR: ponto=milhar, vírgula=decimal
  var n=parseFloat(s); return isNaN(n)?null:n;
}
function dBR(s){ if(!s||s==="—") return "—"; var p=String(s).split("-"); return p.length===3?(p[2].slice(0,2)+"/"+p[1]+"/"+p[0]):s; }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

/* ---------- leitura de registros a partir do DADOS ---------- */
function recEntrada(){return DADOS.entrada.map(function(e){return {parcela:e.parcela,venc:e.venc,valor:e.valor,pago:e.pago,reajuste:e.reajuste,quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recDoc(){return DADOS.doc.map(function(e){return {parcela:e.parcela,rtbi:e.rtbi,cartorio:e.cartorio,total:e.total,quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recObra(){return DADOS.juros.map(function(e){return {parcela:e.parcela,venc:e.venc,valor:e.valor,evolucao:e.evolucao!=null?(e.evolucao*100).toFixed(1)+"%":"",quitado:e.quitado?"Sim":"Não",status:e.status};});}
function recFin(){return DADOS.fin.map(function(e){return {parcela:e.parcela,mes:e.mes,valor:e.valor,amort:e.amort,saldo:e.saldo,quitado:e.quitado?"Sim":"Não",status:e.status};});}

/* ---------- esquemas (campos por módulo) ----------
   tipos: text · number · money · date · check (Pago?) · status (badge, derivado) */
var SCHEMAS={
  entrada:{label:"Parcela da entrada",rep:"Relatório — Entrada Parcelada",get:recEntrada,pagoFill:"pago",fields:[
    {k:"parcela",l:"Parcela",t:"text"},
    {k:"venc",l:"Vencimento",t:"date"},
    {k:"valor",l:"Valor previsto",t:"money"},
    {k:"pago",l:"Valor pago",t:"money"},
    {k:"reajuste",l:"Reajuste",t:"money"},
    {k:"quitado",l:"Pago?",t:"check"},
    {k:"status",l:"Status",t:"status"}
  ]},
  doc:{label:"Parcela de documentação",rep:"Relatório — Documentação (RTBI + Cartório)",get:recDoc,fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"rtbi",l:"RTBI",t:"money"},
    {k:"cartorio",l:"Cartório",t:"money"},
    {k:"total",l:"Total",t:"money"},
    {k:"quitado",l:"Pago?",t:"check"},
    {k:"status",l:"Status",t:"status"}
  ]},
  obra:{label:"Parcela de juros de obra",rep:"Relatório — Juros de Obra",get:recObra,fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"venc",l:"Vencimento",t:"date"},
    {k:"valor",l:"Valor",t:"money"},
    {k:"evolucao",l:"Evolução da obra",t:"text"},
    {k:"quitado",l:"Pago?",t:"check"},
    {k:"status",l:"Status",t:"status"}
  ]},
  financiamento:{label:"Parcela do financiamento",rep:"Relatório — Financiamento (SAC)",get:recFin,fields:[
    {k:"parcela",l:"Parcela",t:"number"},
    {k:"mes",l:"Mês",t:"date"},
    {k:"valor",l:"Parcela",t:"money"},
    {k:"amort",l:"Amortização",t:"money"},
    {k:"saldo",l:"Saldo devedor",t:"money"},
    {k:"quitado",l:"Pago?",t:"check"},
    {k:"status",l:"Status",t:"status"}
  ]}
};
var NO_CRUD={visao:1,simulador:1,home:1};
function isMoney(f){return f.t==="money";}

/* ---------- estado de trabalho (cópia editável por sessão) ---------- */
var WORK={}, FILTER={};
function work(id){ if(!WORK[id]) WORK[id]=JSON.parse(JSON.stringify(SCHEMAS[id].get())); return WORK[id]; }

/* ---------- store: grava no backend ou avisa (modo demonstração) ---------- */
function apiPost(payload){
  if(!API_URL) return Promise.resolve({offline:true});
  return fetch(API_URL,{method:"POST",mode:"no-cors",body:JSON.stringify(payload)})
    .then(function(){return {ok:true};}).catch(function(){return {erro:true};});
}
function persist(id,action,record,idx,silent){
  return apiPost({modulo:id,acao:action,registro:record,indice:idx}).then(function(res){
    if(silent) return res;
    if(res.offline) toast("Salvo nesta sessão. Conecte o Google Sheets para gravar de verdade.","warn");
    else if(res.erro) toast("Falha ao falar com o backend.","danger");
    else toast("Gravado no Google Sheets.","ok");
    return res;
  });
}

/* ---------- estilos ---------- */
var css=document.createElement("style");
css.textContent=
".abar{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}"+
".ab{border:1px solid #E4E8EF;background:#fff;color:#667085;padding:8px 14px;border-radius:8px;font-weight:600;font-size:.85rem}"+
".ab.on{background:#1C64F0;color:#fff;border-color:#1C64F0}.ab:hover{border-color:#1C64F0}"+
".ab.ghost{margin-left:auto;color:#161B26}"+
".crud-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}"+
".crud-toolbar h2{flex:1;min-width:160px}"+
".btn-new{background:#1C64F0;color:#fff;border:0;padding:9px 15px;border-radius:8px;font-weight:700;font-size:.85rem}"+
".btn-new:hover{background:#3C94FC}"+
".chkfilter{display:flex;align-items:center;gap:7px;font-size:.84rem;color:#161B26;font-weight:600;cursor:pointer;user-select:none}"+
".chkfilter input{width:17px;height:17px;accent-color:#1C64F0;cursor:pointer}"+
".act{border:0;background:none;padding:5px 7px;border-radius:6px;cursor:pointer;color:#667085;font-size:.95rem}"+
".act:hover{background:#EEF2FB;color:#161B26}.act.del:hover{color:#DC2626}"+
".ckcell{display:flex;justify-content:center}"+
".ckcell input{width:19px;height:19px;accent-color:#16A34A;cursor:pointer}"+
".bdg{font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}"+
".bdg.pago{background:#E7F6ED;color:#16A34A}.bdg.vencer{background:#FBF1DC;color:#B7791F}"+
".ovl{position:fixed;inset:0;background:rgba(14,23,38,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}"+
".modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.25)}"+
".modal h3{padding:18px 22px;border-bottom:1px solid #EEF1F6;font-size:1.05rem}"+
".modal .body{padding:18px 22px}.modal .fld{margin-bottom:14px}"+
".modal label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-bottom:6px}"+
".modal input[type=text],.modal input[type=number],.modal input[type=date]{width:100%;padding:10px 12px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.95rem;font-family:inherit}"+
".modal input:focus{outline:none;border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld{display:flex;align-items:stretch;border:1.5px solid #E4E8EF;border-radius:8px;overflow:hidden}"+
".moneyfld:focus-within{border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld .pre{background:#F3F5F9;color:#667085;font-weight:700;font-size:.9rem;display:flex;align-items:center;padding:0 12px;border-right:1px solid #E4E8EF}"+
".moneyfld input{flex:1;border:0!important;border-radius:0;box-shadow:none!important;text-align:right;font-variant-numeric:tabular-nums}"+
".ckfld{display:flex;align-items:center;gap:10px;background:#F7F9FC;border:1.5px solid #E4E8EF;border-radius:8px;padding:11px 14px;cursor:pointer}"+
".ckfld input{width:20px;height:20px;accent-color:#16A34A;cursor:pointer}"+
".ckfld span{font-size:.92rem;font-weight:600;color:#161B26}"+
".modal .foot{padding:14px 22px;border-top:1px solid #EEF1F6;display:flex;gap:10px;justify-content:flex-end}"+
".btn-c{padding:10px 16px;border-radius:8px;font-weight:700;font-size:.88rem;border:1px solid #E4E8EF;background:#fff;color:#667085}"+
".btn-s{padding:10px 18px;border-radius:8px;font-weight:700;font-size:.88rem;border:0;background:#1C64F0;color:#fff}"+
".toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;padding:12px 20px;border-radius:10px;font-size:.86rem;z-index:300;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw}"+
".toast.warn{background:#9A5B0E}.toast.danger{background:#A32D2D}.toast.ok{background:#15803D}"+
".demo-note{background:#E7EFFE;border:1px solid #C3D9FC;color:#13386F;border-radius:10px;padding:10px 14px;font-size:.82rem;margin-bottom:14px}"+
".hint-edit{font-size:.8rem;color:#667085;margin:0 0 12px}"+
"#reportArea{display:none}"+
"@media print{body *{visibility:hidden!important}#reportArea,#reportArea *{visibility:visible!important}#reportArea{display:block!important;position:absolute;left:0;top:0;width:100%;padding:0 6mm}.no-print{display:none!important}}";
document.head.appendChild(css);

function toast(msg,kind){
  var t=document.createElement("div");t.className="toast "+(kind||"");t.textContent=msg;document.body.appendChild(t);
  setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .4s";},2600);
  setTimeout(function(){t.remove();},3100);
}

/* ---------- barra de ações ---------- */
function barHTML(id,mode){
  var rep='<button class="ab ghost" onclick="CRUD.report(\''+id+'\')">Relatório PDF</button>';
  if(NO_CRUD[id]) return '<div class="abar"><button class="ab on" onclick="window.navigate(\''+id+'\')">Painel</button>'+rep+'</div>';
  return '<div class="abar">'+
    '<button class="ab '+(mode==="dash"?"on":"")+'" onclick="window.navigate(\''+id+'\')">Painel</button>'+
    '<button class="ab '+(mode==="manage"?"on":"")+'" onclick="CRUD.manage(\''+id+'\')">Gerenciar dados</button>'+rep+'</div>';
}
var _nav=window.navigate;
window.navigate=function(id){
  _nav(id);
  if(id&&id!=="home"){
    var v=document.getElementById("view");
    if(v) v.insertAdjacentHTML("afterbegin",barHTML(id,"dash"));
  }
};

/* ---------- células da tabela ---------- */
function cellHTML(id,f,r,i){
  var val=r[f.k];
  if(f.t==="check"){
    var on=(val==="Sim"||val===true);
    return '<td class="ckcell"><input type="checkbox" '+(on?"checked":"")+
      ' title="Marcar como pago" onchange="CRUD.togglePago(\''+id+'\','+i+',this.checked)"></td>';
  }
  if(f.t==="status"){
    var pago=(r.quitado==="Sim"||r.quitado===true);
    return '<td><span class="bdg '+(pago?"pago":"vencer")+'">'+(pago?"PAGO":"A VENCER")+'</span></td>';
  }
  if(isMoney(f)) return '<td class="num">'+BRL(val)+'</td>';
  if(f.t==="date") return '<td>'+dBR(val)+'</td>';
  if(val==null||val==="") return '<td>—</td>';
  return '<td>'+esc(val)+'</td>';
}
function rowsHTML(id,rows){
  var sc=SCHEMAS[id];
  return rows.map(function(o){
    var r=o.r,i=o.i;
    return "<tr>"+sc.fields.map(function(f){return cellHTML(id,f,r,i);}).join("")+
      '<td class="num" style="white-space:nowrap"><button class="act" title="Editar" onclick="CRUD.edit(\''+id+'\','+i+')">✎</button>'+
      '<button class="act del" title="Excluir" onclick="CRUD.del(\''+id+'\','+i+')">🗑</button></td></tr>';
  }).join("");
}
function visibleRows(id){
  var rows=work(id), q=(FILTER[id]&&FILTER[id].q||"").toLowerCase(), pend=FILTER[id]&&FILTER[id].pend;
  var sc=SCHEMAS[id];
  return rows.map(function(r,i){return {r:r,i:i};}).filter(function(o){
    if(pend && (o.r.quitado==="Sim"||o.r.quitado===true)) return false;
    if(!q) return true;
    return sc.fields.some(function(f){return String(o.r[f.k]==null?"":o.r[f.k]).toLowerCase().indexOf(q)>=0;});
  });
}

/* ---------- gerenciar dados ---------- */
function manage(id){
  if(!FILTER[id]) FILTER[id]={q:"",pend:false};
  var sc=SCHEMAS[id],v=document.getElementById("view");
  var head=sc.fields.map(function(f){
    var cls=(isMoney(f)?' class="num"':(f.t==="check"?' style="text-align:center"':''));
    return "<th"+cls+">"+f.l+"</th>";
  }).join("")+'<th class="num">Ações</th>';
  v.innerHTML=barHTML(id,"manage")+
    (API_URL?"":'<div class="demo-note"><b>Modo demonstração:</b> as edições valem nesta sessão. A gravação real ativa ao conectar o Google Sheets.</div>')+
    '<div class="card">'+
    '<div class="crud-toolbar"><h2>Gerenciar — '+sc.label+'</h2>'+
      '<label class="chkfilter"><input type="checkbox" id="crudPend" '+(FILTER[id].pend?"checked":"")+' onchange="CRUD.setPend(\''+id+'\',this.checked)"> só a vencer</label>'+
      '<input id="crudBusca" value="'+esc(FILTER[id].q)+'" placeholder="Buscar..." oninput="CRUD.filter(\''+id+'\')" style="padding:8px 11px;border:1px solid #E4E8EF;border-radius:8px;font-size:.85rem">'+
      '<button class="btn-new" onclick="CRUD.add(\''+id+'\')">＋ Novo</button></div>'+
    '<p class="hint-edit">Dica: marque o <b>quadradinho “Pago?”</b> para quitar a parcela em 1 clique, ou use ✎ para editar.</p>'+
    '<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody id="crudBody"></tbody></table></div>'+
    '<div id="crudCount" style="margin-top:10px;font-size:.8rem;color:#667085"></div></div>';
  renderBody(id);
}
function renderBody(id){
  var sc=SCHEMAS[id],vis=visibleRows(id);
  var html=rowsHTML(id,vis)||'<tr><td colspan="'+(sc.fields.length+1)+'" style="color:#667085">Nenhum registro.</td></tr>';
  document.getElementById("crudBody").innerHTML=html;
  var total=work(id).length, pagas=work(id).filter(function(r){return r.quitado==="Sim"||r.quitado===true;}).length;
  document.getElementById("crudCount").innerHTML=vis.length+" de "+total+" registro(s) · <b>"+pagas+"</b> pago(s) · "+(total-pagas)+" a vencer";
}
function filter(id){ FILTER[id].q=document.getElementById("crudBusca").value||""; renderBody(id); }
function setPend(id,on){ FILTER[id].pend=!!on; renderBody(id); }

function togglePago(id,i,checked){
  var sc=SCHEMAS[id], r=work(id)[i];
  r.quitado=checked?"Sim":"Não";
  r.status=checked?"PAGO":"A VENCER";
  if(checked && sc.pagoFill && (r[sc.pagoFill]==null||r[sc.pagoFill]==="")) r[sc.pagoFill]=r.valor;
  if(!checked && sc.pagoFill) r[sc.pagoFill]=null;
  persist(id,"update",r,i);
  renderBody(id);
}

/* ---------- formulário (modal) ---------- */
function fieldInput(f,cur){
  if(f.t==="status") return ""; // status é automático (derivado do Pago?)
  var lbl='<label>'+f.l+(isMoney(f)?" (R$)":"")+'</label>';
  if(f.t==="check"){
    var on=(cur==="Sim"||cur===true);
    return '<div class="fld"><label>'+f.l+'</label><label class="ckfld"><input type="checkbox" id="fld_'+f.k+'" '+(on?"checked":"")+'><span>Parcela paga / quitada</span></label></div>';
  }
  if(f.t==="money"){
    var disp=(cur==null||cur==="")?"":moneyFmt(cur);
    return '<div class="fld">'+lbl+'<div class="moneyfld"><span class="pre">R$</span>'+
      '<input id="fld_'+f.k+'" type="text" inputmode="decimal" value="'+esc(disp)+'" onblur="CRUD.fmtMoney(this)"></div></div>';
  }
  if(f.t==="date") return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="date" value="'+esc(cur||"")+'"></div>';
  if(f.t==="number") return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="number" step="1" value="'+esc(cur)+'"></div>';
  return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="text" value="'+esc(cur)+'"></div>';
}
function openForm(id,idx){
  var sc=SCHEMAS[id];var rec=idx==null?{}:work(id)[idx];
  var fields=sc.fields.map(function(f){return fieldInput(f,rec[f.k]!=null?rec[f.k]:"");}).join("");
  var ovl=document.createElement("div");ovl.className="ovl";ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>'+(idx==null?"Novo":"Editar")+" — "+sc.label+'</h3>'+
    '<div class="body">'+fields+'</div>'+
    '<div class="foot"><button class="btn-c" onclick="CRUD.close()">Cancelar</button>'+
    '<button class="btn-s" onclick="CRUD.save(\''+id+'\','+(idx==null?"null":idx)+')">Salvar</button></div></div>';
  ovl.addEventListener("click",function(e){if(e.target===ovl)closeForm();});
  document.body.appendChild(ovl);
  var first=ovl.querySelector("input"); if(first) first.focus();
}
function fmtMoney(el){ var n=moneyParse(el.value); el.value=(n==null?"":moneyFmt(n)); }
function closeForm(){var o=document.getElementById("crudOvl");if(o)o.remove();}
function save(id,idx){
  var sc=SCHEMAS[id];var rec={};
  sc.fields.forEach(function(f){
    if(f.t==="status") return;
    var el=document.getElementById("fld_"+f.k);
    if(!el) return;
    if(f.t==="check") rec[f.k]=el.checked?"Sim":"Não";
    else if(isMoney(f)) rec[f.k]=moneyParse(el.value);
    else if(f.t==="number"){ rec[f.k]=el.value===""?null:Number(el.value); }
    else rec[f.k]=el.value;
  });
  rec.status=(rec.quitado==="Sim")?"PAGO":"A VENCER"; // status automático
  if(rec.quitado==="Sim" && sc.pagoFill && (rec[sc.pagoFill]==null)) rec[sc.pagoFill]=rec.valor;
  var rows=work(id);
  if(idx==null) rows.push(rec); else rows[idx]=rec;
  persist(id,idx==null?"create":"update",rec,idx==null?rows.length-1:idx);
  closeForm();
  if(!document.getElementById("crudBody")) manage(id); else renderBody(id);
}
function del(id,idx){
  if(!confirm("Excluir este registro?"))return;
  var rows=work(id);var rec=rows[idx];rows.splice(idx,1);
  persist(id,"delete",rec,idx);
  renderBody(id);
}

/* ---------- relatório imprimível (PDF via impressão) ---------- */
function cellReport(id,f,r){
  var val=r[f.k];
  if(f.t==="status"){return (r.quitado==="Sim")?"PAGO":"A VENCER";}
  if(f.t==="check"){return (val==="Sim"||val===true)?"Pago":"A vencer";}
  if(isMoney(f)) return BRL(val);
  if(f.t==="date") return dBR(val);
  return val==null||val===""?"—":val;
}
function reportRows(id){
  if(id==="visao") return {rep:"Relatório — Visão Geral do Imóvel",head:["Indicador","Valor"],body:resumoVisao()};
  if(id==="simulador") return {rep:"Relatório — Simulação de Amortização",head:["Cenário","Meses","Juros","Total desembolsado"],body:resumoSim()};
  var sc=SCHEMAS[id],rows=work(id);
  return {rep:sc.rep,head:["#"].concat(sc.fields.map(function(f){return f.l;})),
    body:rows.map(function(r,i){return [i+1].concat(sc.fields.map(function(f){return cellReport(id,f,r);}));})};
}
function resumoVisao(){var r=DADOS.resumo;return [
  ["Imóvel",DADOS._meta.imovel],["Já investido",BRL(r.totalInvestido)],["Custo total do imóvel",BRL(r.custoTotal)],
  ["Falta pagar",BRL(r.faltaPagar)],["Concluído",(r.totalInvestido/r.custoTotal*100).toFixed(1).replace(".",",")+"%"],
  ["Saldo do financiamento",BRL(DADOS.finMeta.saldoInicial)]];}
function resumoSim(){var s=DADOS.sim;return [
  ["Sem aporte",s.mesesBase+" meses",BRL(s.jurosBase),BRL(s.totalBase)],
  ["Com aporte de "+BRL(s.aporteExtra)+"/mês",s.mesesSim+" meses",BRL(s.jurosSim),BRL(s.totalSim)],
  ["Economia",(s.mesesBase-s.mesesSim)+" meses",BRL(s.jurosBase-s.jurosSim),BRL(s.totalBase-s.totalSim)]];}
function report(id){
  var R=reportRows(id);
  var head=R.head.map(function(h){return "<th style=\"text-align:left;padding:6px 8px;border-bottom:2px solid #1C64F0\">"+h+"</th>";}).join("");
  var body=R.body.map(function(row){return "<tr>"+row.map(function(c){return "<td style=\"padding:5px 8px;border-bottom:1px solid #e5e5e5\">"+(c==null?"—":c)+"</td>";}).join("")+"</tr>";}).join("");
  var area=document.getElementById("reportArea")||document.createElement("div");
  area.id="reportArea";
  area.innerHTML=
    '<div style="font-family:Inter,Arial,sans-serif;color:#0E1726;padding:8mm 0">'+
    '<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1C64F0;padding-bottom:10px;margin-bottom:14px">'+
      '<img src="vizio-symbol-dark.png" style="height:40px"><img src="vizio-wordmark-dark.png" style="height:26px">'+
      '<div style="margin-left:6px"><div style="font-size:17px;font-weight:800">Gerenciador de Financiamento</div>'+
      '<div style="font-size:12px;color:#555">'+R.rep+' · '+DADOS._meta.imovel+'</div></div>'+
      '<div style="margin-left:auto;text-align:right;font-size:11px;color:#777">Emitido em '+new Date().toLocaleDateString("pt-BR")+'<br>'+R.body.length+' registro(s)</div></div>'+
    '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#F3F5F9">'+head+
      '</tr></thead><tbody>'+body+'</tbody></table>'+
    '<div style="margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#888;display:flex;justify-content:space-between">'+
      '<span><b>Gerenciador de Financiamento by VIZIO</b> · Sua planilha virou software.</span><span>um produto INPERSON</span></div>'+
    '</div>';
  if(!area.parentNode)document.body.appendChild(area);
  toast("Abrindo a janela de impressão — escolha “Salvar como PDF”.","ok");
  setTimeout(function(){window.print();},350);
}

/* ---------- API pública ---------- */
window.CRUD={manage:manage,filter:filter,setPend:setPend,togglePago:togglePago,fmtMoney:fmtMoney,
  add:function(id){openForm(id,null);},edit:function(id,i){openForm(id,i);},
  save:save,del:del,close:closeForm,report:report,_setApi:function(u){API_URL=u;}};

})();
