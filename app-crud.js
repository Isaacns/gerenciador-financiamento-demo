/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Cadastro/Edição + Config de etapa + Relatórios
 * Edita DADOS diretamente (quitado boolean) e RECALCULA o resumo a cada mudança,
 * então os painéis (HOME/Visão/módulos) refletem o que é incluído.
 * - Configuração da etapa: valor total, forma (à vista/parcelado), nº de parcelas,
 *   parcelas fixas ou com juros (SAC/PRICE no financiamento) + "Gerar parcelas".
 * - Marcar parcela paga abate do total (pago acumulado, falta = total − pago).
 * - Relatório PDF com resumo (pago, falta, %). Grava no Sheets quando API_URL setada.
 * =========================================================================== */
(function(){
"use strict";

var API_URL = "https://script.google.com/macros/s/AKfycbxrOR7LZBG-r5RYLDKNYnUS8axM1le2IuRa8ZrD4zdA-najiCZ-5AwplHnmAFVkW6ZR/exec";

/* ---------- helpers ---------- */
function r2(n){ return Math.round((Number(n)||0)*100)/100; }
function moneyFmt(n){ return (Number(n)||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2}); }
function BRL(v){ return (v==null||v==="")?"—":"R$ "+moneyFmt(v); }
function moneyParse(s){ if(s==null||s==="")return null; s=String(s).replace(/[^\d.,-]/g,""); if(s.indexOf(",")>=0)s=s.replace(/\./g,"").replace(",","."); var n=parseFloat(s); return isNaN(n)?null:n; }
function dBR(s){ if(!s||s==="—")return "—"; var p=String(s).split("-"); return p.length===3?(p[2].slice(0,2)+"/"+p[1]+"/"+p[0]):s; }
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function addMonths(ym,k){ if(!ym)return ""; var p=String(ym).split("-"); var y=+p[0],m=(+p[1]||1)-1+k; y+=Math.floor(m/12); m=((m%12)+12)%12; var d=p[2]||"08"; return y+"-"+String(m+1).padStart(2,"0")+"-"+String(d).padStart(2,"0"); }

/* ---------- módulos: mapeamento id -> array em DADOS ---------- */
var ARR={entrada:"entrada",doc:"doc",obra:"juros",financiamento:"fin"};
function rows(id){ if(!DADOS[ARR[id]]) DADOS[ARR[id]]=[]; return DADOS[ARR[id]]; }
function isPago(e){ return e.quitado===true; }

/* ---------- esquemas (campos do formulário/tabela por módulo) ----------
   tipos: text · number · money · date · check (Pago?) · status (badge, auto) */
var SCHEMAS={
  entrada:{label:"Parcela da entrada",rep:"Entrada Parcelada",hasCfg:true,kind:"etapa",pagoFill:"pago",fields:[
    {k:"parcela",l:"Parcela",t:"text"},{k:"venc",l:"Vencimento",t:"date"},
    {k:"valor",l:"Valor",t:"money"},{k:"pago",l:"Valor pago",t:"money"},
    {k:"reajuste",l:"Juros/Reajuste",t:"money"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  doc:{label:"Parcela de documentação",rep:"Documentação (RTBI + Cartório)",hasCfg:true,kind:"etapa",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"rtbi",l:"RTBI",t:"money"},{k:"cartorio",l:"Cartório",t:"money"},
    {k:"total",l:"Total",t:"money"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  obra:{label:"Parcela de juros de obra",rep:"Juros de Obra",hasCfg:false,kind:"etapa",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"venc",l:"Vencimento",t:"date"},{k:"valor",l:"Valor",t:"money"},
    {k:"evolucao",l:"Evolução da obra",t:"text"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]},
  financiamento:{label:"Parcela do financiamento",rep:"Financiamento",hasCfg:true,kind:"fin",fields:[
    {k:"parcela",l:"Parcela",t:"number"},{k:"mes",l:"Mês",t:"date"},{k:"valor",l:"Parcela",t:"money"},
    {k:"amort",l:"Amortização",t:"money"},{k:"saldo",l:"Saldo devedor",t:"money"},{k:"quitado",l:"Pago?",t:"check"},{k:"status",l:"Status",t:"status"}
  ]}
};
var NO_CRUD={visao:1,simulador:1,home:1};
function isMoney(f){return f.t==="money";}

/* ---------- configuração das etapas (armazenada em DADOS._cfgMod) ---------- */
function cfg(id){
  if(!DADOS._cfgMod) DADOS._cfgMod={};
  if(!DADOS._cfgMod[id]){
    DADOS._cfgMod[id]= id==="financiamento"
      ? {total:0,tipo:"SAC",meses:0,taxa:0,data:""}
      : {total:0,forma:"parcelado",nParc:0,tipo:(id==="doc"?"fixa":"fixa"),taxa:0,data:""};
  }
  return DADOS._cfgMod[id];
}

/* ---------- RECÁLCULO: resumo + finMeta a partir dos arrays (corrige "não atualiza") ---------- */
function sumPrev(arr,valK){ return arr.reduce(function(s,e){return s+(Number(e[valK]||e.valor||0));},0); }
function sumPago(arr,valK){ return arr.filter(isPago).reduce(function(s,e){return s+(Number(e.pago!=null?e.pago:(e[valK]||e.valor||0)));},0); }
function recompute(){
  var d=DADOS; if(!d.resumo)d.resumo={}; if(!d.finMeta)d.finMeta={};
  // entrada
  var cE=cfg("entrada"); var ePrev=cE.total>0?cE.total:sumPrev(d.entrada,"valor"); var ePago=sumPago(d.entrada,"valor");
  d.resumo.entradaPrev=r2(ePrev); d.resumo.entradaPago=r2(ePago); d.resumo.entradaPct=ePrev?r2(ePago/ePrev*1):0; d.resumo.entradaPct=ePrev?ePago/ePrev:0;
  // doc
  var cD=cfg("doc"); var dPrev=cD.total>0?cD.total:sumPrev(d.doc,"total"); var dPago=d.doc.filter(isPago).reduce(function(s,e){return s+(e.total||0);},0);
  d.resumo.docPrev=r2(dPrev); d.resumo.docPago=r2(dPago); d.resumo.docPct=dPrev?dPago/dPrev:0;
  // obra (juros)
  var oPrev=sumPrev(d.juros,"total"); var oPago=d.juros.filter(isPago).reduce(function(s,e){return s+(e.total||e.valor||0);},0);
  d.resumo.jurosPrev=r2(oPrev); d.resumo.jurosPago=r2(oPago); d.resumo.jurosPct=oPrev?oPago/oPrev:0;
  // financiamento
  var cF=cfg("financiamento"); var saldoIni=cF.total>0?cF.total:(d.finMeta.saldoInicial||0);
  var pagos=d.fin.filter(isPago); var amortPaid=pagos.reduce(function(s,e){return s+(e.amort||0);},0);
  var finTotalPago=pagos.reduce(function(s,e){return s+(e.valor||0);},0);
  d.finMeta.saldoInicial=r2(saldoIni);
  if(cF.taxa>0) d.finMeta.jurosMensal=cF.taxa/100;
  d.finMeta.totalPago=r2(finTotalPago);
  d.finMeta.saldoAtual=r2(Math.max(0,saldoIni-amortPaid));
  d.finMeta.parcelasPagas=pagos.length;
  d.finMeta.parcelasRestantes=Math.max(0,d.fin.length-pagos.length);
  d.finMeta.pctQuitado=saldoIni?amortPaid/saldoIni:0;
  // totais
  var invest=ePago+dPago+oPago+finTotalPago;
  var custo=ePrev+dPrev+oPrev+saldoIni;
  d.resumo.totalInvestido=r2(invest); d.resumo.custoTotal=r2(custo); d.resumo.faltaPagar=r2(custo-invest); d.resumo.finSaldo=d.finMeta.saldoAtual;
}
/* resumo por etapa (p/ tela e relatório) */
function resumoEtapa(id){
  recompute(); var r=DADOS.resumo;
  if(id==="entrada")return {pago:r.entradaPago,prev:r.entradaPrev,pct:r.entradaPct};
  if(id==="doc")return {pago:r.docPago,prev:r.docPrev,pct:r.docPct};
  if(id==="obra")return {pago:r.jurosPago,prev:r.jurosPrev,pct:r.jurosPct};
  if(id==="financiamento"){var fm=DADOS.finMeta;return {pago:fm.totalPago,prev:fm.saldoInicial,pct:fm.pctQuitado,saldo:fm.saldoAtual};}
  return {pago:0,prev:0,pct:0};
}

/* ---------- gerar parcelas a partir da configuração ---------- */
function gerar(id){
  var c=cfg(id), out=[];
  if(id==="financiamento"){
    var V=c.total||0, i=(c.taxa||0)/100, n=parseInt(c.meses)||0, sist=c.tipo||"SAC";
    if(V<=0||n<=0){toast("Preencha valor financiado e nº de meses.","warn");return;}
    var saldo=V, amortSAC=V/n, parcP=i>0?V*i/(1-Math.pow(1+i,-n)):V/n;
    for(var k=1;k<=n;k++){ var juros=saldo*i,parc,amort; if(sist==="PRICE"){parc=parcP;amort=parc-juros;}else{amort=amortSAC;parc=amort+juros;} saldo=Math.max(0,saldo-amort); out.push({parcela:k,mes:addMonths(c.data||"2027-01",k-1),valor:r2(parc),amort:r2(amort),total:r2(parc),saldo:r2(saldo),quitado:false,status:"A VENCER"}); }
    DADOS.fin=out;
  } else if(id==="doc"){
    var T=c.total||0, nd=c.forma==="avista"?1:(parseInt(c.nParc)||0); if(T<=0||nd<=0){toast("Preencha valor total e nº de parcelas.","warn");return;}
    var vd=T/nd; for(var j=1;j<=nd;j++) out.push({parcela:j,rtbi:r2(vd),cartorio:0,total:r2(vd),quitado:false,status:"A VENCER"});
    DADOS.doc=out;
  } else if(id==="entrada"){
    var Te=c.total||0, ne=c.forma==="avista"?1:(parseInt(c.nParc)||0), ie=(c.taxa||0)/100, fixa=(c.tipo!=="juros"); if(Te<=0||ne<=0){toast("Preencha valor total e nº de parcelas.","warn");return;}
    var pe=(!fixa&&ie>0)?Te*ie/(1-Math.pow(1+ie,-ne)):Te/ne;
    for(var m=1;m<=ne;m++){ var jr=(!fixa&&ie>0)?r2(pe-Te/ne):0; out.push({parcela:String(m),venc:addMonths(c.data||"2024-01",m-1),valor:r2(pe),pago:null,reajuste:jr,quitado:false,status:"A VENCER"}); }
    DADOS.entrada=out;
  }
  recompute();
  toast(out.length+" parcela(s) gerada(s). Marque as pagas para abater do total.","ok");
  manage(id);
}

/* ---------- store (backend) ---------- */
function apiPost(p){ if(!API_URL)return Promise.resolve({offline:true}); return fetch(API_URL,{method:"POST",mode:"no-cors",body:JSON.stringify(p)}).then(function(){return {ok:true};}).catch(function(){return {erro:true};}); }
function toRec(id,e){ var o={}; SCHEMAS[id].fields.forEach(function(f){ if(f.k==="quitado")o.quitado=e.quitado?"Sim":"Não"; else if(f.k==="status")o.status=e.quitado?"PAGO":"A VENCER"; else o[f.k]=e[f.k]; }); return o; }
function persist(id,action,e,idx,silent){
  return apiPost({modulo:id,acao:action,registro:toRec(id,e||{}),indice:idx}).then(function(res){
    if(silent)return res;
    if(res.offline)toast("Salvo nesta sessão. Conecte o Google Sheets para gravar de verdade.","warn");
    else if(res.erro)toast("Falha ao falar com o backend.","danger");
    else toast("Gravado no Google Sheets.","ok");
    return res;
  });
}

/* ---------- estilos ---------- */
var css=document.createElement("style");
css.textContent=
".abar{display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap}"+
".ab{border:1px solid #E4E8EF;background:#fff;color:#667085;padding:8px 14px;border-radius:8px;font-weight:600;font-size:.85rem}"+
".ab.on{background:#1C64F0;color:#fff;border-color:#1C64F0}.ab:hover{border-color:#1C64F0}.ab.ghost{margin-left:auto;color:#161B26}"+
".cfgcard{background:#F7F9FC;border:1px solid #E4E8EF;border-radius:12px;padding:16px 18px;margin-bottom:16px}"+
".cfgcard h3{font-size:.95rem;font-weight:800;margin-bottom:3px}.cfgcard .cap{font-size:.8rem;color:#667085;margin-bottom:12px}"+
".cfgrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;align-items:end}"+
".cfgf label{display:block;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#667085;margin-bottom:4px}"+
".cfgf input,.cfgf select{width:100%;padding:9px 11px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.9rem;font-family:inherit}"+
".cfgf input:focus,.cfgf select:focus{outline:none;border-color:#1C64F0}"+
".cfgbtns{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}"+
".cfgsum{margin-top:12px;display:flex;gap:18px;flex-wrap:wrap;font-size:.85rem;border-top:1px dashed #D7DEEA;padding-top:10px}"+
".cfgsum b{font-variant-numeric:tabular-nums}.cfgsum .g{color:#16A34A}.cfgsum .r{color:#B7791F}"+
".crud-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px}.crud-toolbar h2{flex:1;min-width:160px}"+
".btn-new{background:#1C64F0;color:#fff;border:0;padding:9px 15px;border-radius:8px;font-weight:700;font-size:.85rem}.btn-new:hover{background:#3C94FC}"+
".btn-gen{background:#11151f;color:#fff;border:0;padding:9px 14px;border-radius:8px;font-weight:700;font-size:.85rem}.btn-gen:hover{background:#1b2233}"+
".btn-save2{background:#fff;color:#1C64F0;border:1.5px solid #1C64F0;padding:8px 14px;border-radius:8px;font-weight:700;font-size:.85rem}"+
".chkfilter{display:flex;align-items:center;gap:7px;font-size:.84rem;color:#161B26;font-weight:600;cursor:pointer;user-select:none}.chkfilter input{width:17px;height:17px;accent-color:#1C64F0;cursor:pointer}"+
".act{border:0;background:none;padding:5px 7px;border-radius:6px;cursor:pointer;color:#667085;font-size:.95rem}.act:hover{background:#EEF2FB;color:#161B26}.act.del:hover{color:#DC2626}"+
".ckcell{text-align:center}.ckcell input{width:19px;height:19px;accent-color:#16A34A;cursor:pointer}"+
".bdg{font-size:.7rem;font-weight:700;padding:3px 10px;border-radius:999px;white-space:nowrap}.bdg.pago{background:#E7F6ED;color:#16A34A}.bdg.vencer{background:#FBF1DC;color:#B7791F}"+
".ovl{position:fixed;inset:0;background:rgba(14,23,38,.5);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}"+
".modal{background:#fff;border-radius:16px;max-width:520px;width:100%;max-height:90vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.25)}"+
".modal h3{padding:18px 22px;border-bottom:1px solid #EEF1F6;font-size:1.05rem}.modal .body{padding:18px 22px}.modal .fld{margin-bottom:14px}"+
".modal label{display:block;font-size:.72rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#667085;margin-bottom:6px}"+
".modal input[type=text],.modal input[type=number],.modal input[type=date]{width:100%;padding:10px 12px;border:1.5px solid #E4E8EF;border-radius:8px;font-size:.95rem;font-family:inherit}"+
".modal input:focus{outline:none;border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld{display:flex;border:1.5px solid #E4E8EF;border-radius:8px;overflow:hidden}.moneyfld:focus-within{border-color:#1C64F0;box-shadow:0 0 0 3px #E7EFFE}"+
".moneyfld .pre{background:#F3F5F9;color:#667085;font-weight:700;font-size:.9rem;display:flex;align-items:center;padding:0 12px;border-right:1px solid #E4E8EF}"+
".moneyfld input{flex:1;border:0!important;border-radius:0;box-shadow:none!important;text-align:right;font-variant-numeric:tabular-nums}"+
".ckfld{display:flex;align-items:center;gap:10px;background:#F7F9FC;border:1.5px solid #E4E8EF;border-radius:8px;padding:11px 14px;cursor:pointer}.ckfld input{width:20px;height:20px;accent-color:#16A34A;cursor:pointer}.ckfld span{font-size:.92rem;font-weight:600;color:#161B26}"+
".modal .foot{padding:14px 22px;border-top:1px solid #EEF1F6;display:flex;gap:10px;justify-content:flex-end}"+
".btn-c{padding:10px 16px;border-radius:8px;font-weight:700;font-size:.88rem;border:1px solid #E4E8EF;background:#fff;color:#667085}.btn-s{padding:10px 18px;border-radius:8px;font-weight:700;font-size:.88rem;border:0;background:#1C64F0;color:#fff}"+
".toast{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;padding:12px 20px;border-radius:10px;font-size:.86rem;z-index:300;box-shadow:0 8px 24px rgba(0,0,0,.25);max-width:90vw}.toast.warn{background:#9A5B0E}.toast.danger{background:#A32D2D}.toast.ok{background:#15803D}"+
".demo-note{background:#E7EFFE;border:1px solid #C3D9FC;color:#13386F;border-radius:10px;padding:10px 14px;font-size:.82rem;margin-bottom:14px}"+
".hint-edit{font-size:.8rem;color:#667085;margin:0 0 12px}"+
"#reportArea{display:none}"+
"@media print{body *{visibility:hidden!important}#reportArea,#reportArea *{visibility:visible!important}#reportArea{display:block!important;position:absolute;left:0;top:0;width:100%;padding:0 6mm}.no-print{display:none!important}}";
document.head.appendChild(css);
function toast(msg,kind){var t=document.createElement("div");t.className="toast "+(kind||"");t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.style.opacity="0";t.style.transition="opacity .4s";},2600);setTimeout(function(){t.remove();},3100);}

/* ---------- barra de ações ---------- */
function barHTML(id,mode){
  var rep='<button class="ab ghost" onclick="CRUD.report(\''+id+'\')">Relatório PDF</button>';
  if(NO_CRUD[id])return '<div class="abar"><button class="ab on" onclick="window.navigate(\''+id+'\')">Painel</button>'+rep+'</div>';
  return '<div class="abar"><button class="ab '+(mode==="dash"?"on":"")+'" onclick="window.navigate(\''+id+'\')">Painel</button>'+
    '<button class="ab '+(mode==="manage"?"on":"")+'" onclick="CRUD.manage(\''+id+'\')">Gerenciar dados</button>'+rep+'</div>';
}
var _nav=window.navigate;
window.navigate=function(id){ _nav(id); if(id&&id!=="home"){var v=document.getElementById("view");if(v)v.insertAdjacentHTML("afterbegin",barHTML(id,"dash"));} };

/* ---------- células ---------- */
function cellHTML(id,f,e,i){
  if(f.t==="check")return '<td class="ckcell"><input type="checkbox" '+(isPago(e)?"checked":"")+' title="Marcar como pago" onchange="CRUD.togglePago(\''+id+'\','+i+',this.checked)"></td>';
  if(f.t==="status")return '<td><span class="bdg '+(isPago(e)?"pago":"vencer")+'">'+(isPago(e)?"PAGO":"A VENCER")+'</span></td>';
  if(isMoney(f))return '<td class="num">'+BRL(e[f.k])+'</td>';
  if(f.t==="date")return '<td>'+dBR(e[f.k])+'</td>';
  return '<td>'+(e[f.k]==null||e[f.k]===""?"—":esc(e[f.k]))+'</td>';
}
var FILTER={};
function visible(id){
  var q=(FILTER[id]&&FILTER[id].q||"").toLowerCase(), pend=FILTER[id]&&FILTER[id].pend, sc=SCHEMAS[id];
  return rows(id).map(function(e,i){return {e:e,i:i};}).filter(function(o){
    if(pend&&isPago(o.e))return false;
    if(!q)return true;
    return sc.fields.some(function(f){return String(o.e[f.k]==null?"":o.e[f.k]).toLowerCase().indexOf(q)>=0;});
  });
}

/* ---------- config card ---------- */
function cfgCardHTML(id){
  if(!SCHEMAS[id].hasCfg)return "";
  var c=cfg(id), s=resumoEtapa(id);
  var inner;
  if(id==="financiamento"){
    inner='<div class="cfgrow">'+
      '<div class="cfgf"><label>Valor financiado (R$)</label><input id="cf_total" value="'+(c.total||"")+'"></div>'+
      '<div class="cfgf"><label>Tipo</label><select id="cf_tipo"><option value="SAC"'+(c.tipo==="SAC"?" selected":"")+'>SAC (decrescente)</option><option value="PRICE"'+(c.tipo==="PRICE"?" selected":"")+'>PRICE (fixa)</option></select></div>'+
      '<div class="cfgf"><label>Nº de meses</label><input id="cf_meses" type="number" value="'+(c.meses||"")+'"></div>'+
      '<div class="cfgf"><label>Juros (% a.m.)</label><input id="cf_taxa" type="number" step="0.01" value="'+(c.taxa||"")+'"></div>'+
      '<div class="cfgf"><label>1ª parcela</label><input id="cf_data" type="month" value="'+(String(c.data||"").slice(0,7))+'"></div></div>';
  } else {
    var jurosShow=(id==="entrada");
    inner='<div class="cfgrow">'+
      '<div class="cfgf"><label>Valor total (R$)</label><input id="cf_total" value="'+(c.total||"")+'"></div>'+
      '<div class="cfgf"><label>Forma</label><select id="cf_forma" onchange="CRUD.cfgForma(\''+id+'\')"><option value="avista"'+(c.forma==="avista"?" selected":"")+'>À vista</option><option value="parcelado"'+(c.forma!=="avista"?" selected":"")+'>Parcelado</option></select></div>'+
      '<div class="cfgf"><label>Nº de parcelas</label><input id="cf_nparc" type="number" value="'+(c.nParc||"")+'" '+(c.forma==="avista"?"disabled":"")+'></div>'+
      (jurosShow?'<div class="cfgf"><label>Tipo</label><select id="cf_tipo"><option value="fixa"'+(c.tipo!=="juros"?" selected":"")+'>Parcelas fixas</option><option value="juros"'+(c.tipo==="juros"?" selected":"")+'>Com juros</option></select></div>'+
      '<div class="cfgf"><label>Juros (% a.m.)</label><input id="cf_taxa" type="number" step="0.01" value="'+(c.taxa||"")+'"></div>':'<div class="cfgf"><label>Tipo</label><input value="Parcelas fixas" disabled></div>')+
      '<div class="cfgf"><label>1ª parcela</label><input id="cf_data" type="month" value="'+(String(c.data||"").slice(0,7))+'"></div></div>';
  }
  var pct=(s.pct*100).toFixed(1).replace(".",",");
  return '<div class="cfgcard"><h3>⚙ Configuração da etapa</h3>'+
    '<div class="cap">Defina o valor total e a forma de pagamento. Use <b>Gerar parcelas</b> para criar o cronograma automaticamente, ou inclua manualmente em <b>＋ Novo</b> com base no seu contrato. Ao marcar uma parcela como paga, ela abate do total.</div>'+
    inner+
    '<div class="cfgbtns"><button class="btn-gen" onclick="CRUD.gerar(\''+id+'\')">⚙ Gerar parcelas</button><button class="btn-save2" onclick="CRUD.saveCfg(\''+id+'\')">Salvar configuração</button></div>'+
    '<div class="cfgsum"><span>Total: <b>'+BRL(s.prev)+'</b></span><span class="g">Já pago: <b>'+BRL(s.pago)+'</b></span><span class="r">Falta: <b>'+BRL((s.prev||0)-(s.pago||0))+'</b></span><span>Concluído: <b>'+pct+'%</b></span></div></div>';
}
function readCfg(id){
  var c=cfg(id), g=function(x){var el=document.getElementById(x);return el?el.value:"";};
  c.total=moneyParse(g("cf_total"))||0;
  c.data=g("cf_data")?g("cf_data")+"-08":"";
  if(id==="financiamento"){ c.tipo=g("cf_tipo")||"SAC"; c.meses=parseInt(g("cf_meses"))||0; c.taxa=parseFloat(g("cf_taxa"))||0; }
  else { c.forma=g("cf_forma")||"parcelado"; c.nParc=parseInt(g("cf_nparc"))||0; if(id==="entrada"){c.tipo=g("cf_tipo")||"fixa";c.taxa=parseFloat(g("cf_taxa"))||0;} else c.tipo="fixa"; }
  return c;
}
function saveCfg(id){ readCfg(id); recompute(); toast("Configuração salva.","ok"); manage(id); }
function cfgForma(id){ var f=document.getElementById("cf_forma"),n=document.getElementById("cf_nparc"); if(f&&n){n.disabled=(f.value==="avista");} }

/* ---------- gerenciar dados ---------- */
function manage(id){
  if(!FILTER[id])FILTER[id]={q:"",pend:false};
  var sc=SCHEMAS[id],v=document.getElementById("view");
  var head=sc.fields.map(function(f){var cls=(isMoney(f)?' class="num"':(f.t==="check"?' style="text-align:center"':''));return "<th"+cls+">"+f.l+"</th>";}).join("")+'<th class="num">Ações</th>';
  v.innerHTML=barHTML(id,"manage")+
    (API_URL?"":'<div class="demo-note"><b>Modo demonstração:</b> as edições valem nesta sessão.</div>')+
    cfgCardHTML(id)+
    '<div class="card"><div class="crud-toolbar"><h2>Parcelas — '+sc.label.replace("Parcela de ","").replace("Parcela da ","").replace("Parcela do ","")+'</h2>'+
      '<label class="chkfilter"><input type="checkbox" id="crudPend" '+(FILTER[id].pend?"checked":"")+' onchange="CRUD.setPend(\''+id+'\',this.checked)"> só a vencer</label>'+
      '<input id="crudBusca" value="'+esc(FILTER[id].q)+'" placeholder="Buscar..." oninput="CRUD.filter(\''+id+'\')" style="padding:8px 11px;border:1px solid #E4E8EF;border-radius:8px;font-size:.85rem">'+
      '<button class="btn-new" onclick="CRUD.add(\''+id+'\')">＋ Novo</button></div>'+
    '<p class="hint-edit">Marque o quadradinho <b>“Pago?”</b> para quitar em 1 clique (abate do total), ou ✎ para editar.</p>'+
    '<div class="tbl-wrap"><table><thead><tr>'+head+'</tr></thead><tbody id="crudBody"></tbody></table></div>'+
    '<div id="crudCount" style="margin-top:10px;font-size:.8rem;color:#667085"></div></div>';
  renderBody(id);
}
function renderBody(id){
  var sc=SCHEMAS[id],vis=visible(id);
  document.getElementById("crudBody").innerHTML=vis.map(function(o){
    return "<tr>"+sc.fields.map(function(f){return cellHTML(id,f,o.e,o.i);}).join("")+
      '<td class="num" style="white-space:nowrap"><button class="act" title="Editar" onclick="CRUD.edit(\''+id+'\','+o.i+')">✎</button><button class="act del" title="Excluir" onclick="CRUD.del(\''+id+'\','+o.i+')">🗑</button></td></tr>';
  }).join("")||'<tr><td colspan="'+(sc.fields.length+1)+'" style="color:#667085">Nenhuma parcela. Configure acima e clique em “Gerar parcelas”, ou use “＋ Novo”.</td></tr>';
  var all=rows(id),pg=all.filter(isPago).length;
  document.getElementById("crudCount").innerHTML=vis.length+" de "+all.length+" parcela(s) · <b>"+pg+"</b> paga(s) · "+(all.length-pg)+" a vencer";
}
function filter(id){FILTER[id].q=document.getElementById("crudBusca").value||"";renderBody(id);}
function setPend(id,on){FILTER[id].pend=!!on;renderBody(id);}
function togglePago(id,i,checked){
  var sc=SCHEMAS[id],e=rows(id)[i]; e.quitado=!!checked; e.status=checked?"PAGO":"A VENCER";
  if(checked&&sc.pagoFill&&(e[sc.pagoFill]==null||e[sc.pagoFill]==="")) e[sc.pagoFill]=e.valor;
  if(!checked&&sc.pagoFill) e[sc.pagoFill]=null;
  recompute(); persist(id,"update",e,i); manage(id);
}

/* ---------- formulário ---------- */
function fieldInput(f,cur){
  if(f.t==="status")return "";
  if(f.t==="check"){var on=(cur===true);return '<div class="fld"><label>'+f.l+'</label><label class="ckfld"><input type="checkbox" id="fld_'+f.k+'" '+(on?"checked":"")+'><span>Parcela paga / quitada</span></label></div>';}
  var lbl='<label>'+f.l+(isMoney(f)?" (R$)":"")+'</label>';
  if(f.t==="money"){var disp=(cur==null||cur==="")?"":moneyFmt(cur);return '<div class="fld">'+lbl+'<div class="moneyfld"><span class="pre">R$</span><input id="fld_'+f.k+'" type="text" inputmode="decimal" value="'+esc(disp)+'" onblur="CRUD.fmtMoney(this)"></div></div>';}
  if(f.t==="date")return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="date" value="'+esc(cur||"")+'"></div>';
  if(f.t==="number")return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="number" step="1" value="'+esc(cur)+'"></div>';
  return '<div class="fld">'+lbl+'<input id="fld_'+f.k+'" type="text" value="'+esc(cur)+'"></div>';
}
function openForm(id,idx){
  var sc=SCHEMAS[id],rec=idx==null?{}:rows(id)[idx];
  var fields=sc.fields.map(function(f){return fieldInput(f,rec[f.k]!=null?rec[f.k]:"");}).join("");
  var ovl=document.createElement("div");ovl.className="ovl";ovl.id="crudOvl";
  ovl.innerHTML='<div class="modal"><h3>'+(idx==null?"Novo":"Editar")+" — "+sc.label+'</h3><div class="body">'+fields+'</div>'+
    '<div class="foot"><button class="btn-c" onclick="CRUD.close()">Cancelar</button><button class="btn-s" onclick="CRUD.save(\''+id+'\','+(idx==null?"null":idx)+')">Salvar</button></div></div>';
  ovl.addEventListener("click",function(ev){if(ev.target===ovl)closeForm();});
  document.body.appendChild(ovl);var fi=ovl.querySelector("input");if(fi)fi.focus();
}
function fmtMoney(el){var n=moneyParse(el.value);el.value=(n==null?"":moneyFmt(n));}
function closeForm(){var o=document.getElementById("crudOvl");if(o)o.remove();}
function save(id,idx){
  var sc=SCHEMAS[id],rec=idx==null?{}:Object.assign({},rows(id)[idx]);
  sc.fields.forEach(function(f){ if(f.t==="status")return; var el=document.getElementById("fld_"+f.k); if(!el)return;
    if(f.t==="check")rec.quitado=el.checked; else if(isMoney(f))rec[f.k]=moneyParse(el.value); else if(f.t==="number")rec[f.k]=el.value===""?null:Number(el.value); else rec[f.k]=el.value; });
  rec.status=rec.quitado?"PAGO":"A VENCER";
  if(rec.quitado&&sc.pagoFill&&rec[sc.pagoFill]==null)rec[sc.pagoFill]=rec.valor;
  if(idx==null)rows(id).push(rec);else rows(id)[idx]=rec;
  recompute(); persist(id,idx==null?"create":"update",rec,idx==null?rows(id).length-1:idx);
  closeForm(); manage(id);
}
function del(id,idx){ if(!confirm("Excluir esta parcela?"))return; var e=rows(id)[idx]; rows(id).splice(idx,1); recompute(); persist(id,"delete",e,idx); manage(id); }

/* ---------- relatório (com resumo) ---------- */
function cellReport(id,f,e){ if(f.t==="status")return isPago(e)?"PAGO":"A VENCER"; if(f.t==="check")return isPago(e)?"Pago":"A vencer"; if(isMoney(f))return BRL(e[f.k]); if(f.t==="date")return dBR(e[f.k]); return e[f.k]==null||e[f.k]===""?"—":e[f.k]; }
function report(id){
  recompute();
  var sc=SCHEMAS[id], R, sumHTML="";
  if(id==="visao"){ R={rep:"Visão Geral do Imóvel",head:["Indicador","Valor"],body:[["Imóvel",DADOS._meta.imovel],["Já investido",BRL(DADOS.resumo.totalInvestido)],["Custo total",BRL(DADOS.resumo.custoTotal)],["Falta pagar",BRL(DADOS.resumo.faltaPagar)],["Concluído",((DADOS.resumo.custoTotal?DADOS.resumo.totalInvestido/DADOS.resumo.custoTotal:0)*100).toFixed(1).replace(".",",")+"%"]]}; }
  else if(id==="simulador"){ var s=DADOS.sim; R={rep:"Simulação de Amortização",head:["Cenário","Meses","Juros","Total"],body:[["Sem aporte",s.mesesBase+"m",BRL(s.jurosBase),BRL(s.totalBase)],["Com aporte",s.mesesSim+"m",BRL(s.jurosSim),BRL(s.totalSim)],["Economia",(s.mesesBase-s.mesesSim)+"m",BRL(s.jurosBase-s.jurosSim),BRL(s.totalBase-s.totalSim)]]}; }
  else {
    var rs=resumoEtapa(id), pct=(rs.pct*100).toFixed(1).replace(".",",");
    sumHTML='<div style="display:flex;gap:24px;margin:12px 0;padding:10px 14px;background:#F3F5F9;border-radius:8px;font-size:12px">'+
      '<span>Total previsto: <b>'+BRL(rs.prev)+'</b></span><span style="color:#16A34A">Já pago: <b>'+BRL(rs.pago)+'</b></span>'+
      '<span style="color:#B7791F">Falta: <b>'+BRL((rs.prev||0)-(rs.pago||0))+'</b></span><span>Concluído: <b>'+pct+'%</b></span></div>';
    R={rep:sc.rep,head:["#"].concat(sc.fields.map(function(f){return f.l;})),body:rows(id).map(function(e,i){return [i+1].concat(sc.fields.map(function(f){return cellReport(id,f,e);}));})};
  }
  var head=R.head.map(function(h){return "<th style=\"text-align:left;padding:6px 8px;border-bottom:2px solid #1C64F0\">"+h+"</th>";}).join("");
  var body=R.body.map(function(row){return "<tr>"+row.map(function(c){return "<td style=\"padding:5px 8px;border-bottom:1px solid #e5e5e5\">"+(c==null?"—":c)+"</td>";}).join("")+"</tr>";}).join("");
  var area=document.getElementById("reportArea")||document.createElement("div");area.id="reportArea";
  area.innerHTML='<div style="font-family:Inter,Arial,sans-serif;color:#0E1726;padding:8mm 0">'+
    '<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid #1C64F0;padding-bottom:10px;margin-bottom:14px">'+
      '<img src="vizio-symbol-dark.png" style="height:40px"><img src="vizio-wordmark-dark.png" style="height:26px">'+
      '<div style="margin-left:6px"><div style="font-size:17px;font-weight:800">Gerenciador de Financiamento</div><div style="font-size:12px;color:#555">Relatório — '+R.rep+' · '+DADOS._meta.imovel+'</div></div>'+
      '<div style="margin-left:auto;text-align:right;font-size:11px;color:#777">Emitido em '+new Date().toLocaleDateString("pt-BR")+'<br>'+R.body.length+' registro(s)</div></div>'+
    sumHTML+
    '<table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="background:#F3F5F9">'+head+'</tr></thead><tbody>'+body+'</tbody></table>'+
    '<div style="margin-top:18px;border-top:1px solid #ccc;padding-top:8px;font-size:10px;color:#888;display:flex;justify-content:space-between"><span><b>Gerenciador de Financiamento by VIZIO</b> · Sua planilha virou software.</span><span>um produto INPERSON</span></div></div>';
  if(!area.parentNode)document.body.appendChild(area);
  toast("Abrindo a janela de impressão — escolha “Salvar como PDF”.","ok");
  setTimeout(function(){window.print();},350);
}

/* ---------- recompute inicial (reflete dados já carregados) ---------- */
try{ recompute(); }catch(e){}

/* ---------- API pública ---------- */
window.CRUD={manage:manage,filter:filter,setPend:setPend,togglePago:togglePago,fmtMoney:fmtMoney,
  add:function(id){openForm(id,null);},edit:function(id,i){openForm(id,i);},save:save,del:del,close:closeForm,
  report:report,gerar:gerar,saveCfg:saveCfg,cfgForma:cfgForma,recompute:recompute,_setApi:function(u){API_URL=u;}};

})();
