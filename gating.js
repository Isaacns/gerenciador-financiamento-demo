/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Gating por assinatura (status-based)
 * Carregado por ÚLTIMO (depois de app-crud.js e supabase-mode.js).
 *
 * Fonte da verdade = status REAL da assinatura em fin_assinaturas (gravado pelo
 * webhook stripe-webhook v16). Vocabulário normalizado:
 *   active | trialing | past_due | incomplete | canceled
 *
 * Regra (ver _HANDOFF-Checkout-Gating.md):
 *   - admin (fin_perfis.is_admin) ............ acesso total, sem banner.
 *   - active | trialing ...................... libera tudo, sem banner.
 *   - past_due .............................. LIBERA + banner âmbar "Pagamento
 *                                             pendente — regularize" + Assinar.
 *   - canceled | incomplete | none .......... BLOQUEIO SUAVE: overlay "Assine
 *                                             para acessar" + Assinar (não
 *                                             destrói dados — só impede o uso).
 *
 * Grace opcional (app-level, NÃO é a trial da Stripe): DADOS._cfg.trialDays
 *   (padrão 14) dá um período de cortesia a partir do created_at da conta, no
 *   qual o app fica liberado mesmo sem assinatura — para o cliente ver valor
 *   antes de pagar. Defina trialDays:0 para seguir o handoff ao pé da letra
 *   (sem assinatura = bloqueio imediato).
 *
 * Falha sempre "aberta" (erro de rede/consulta NUNCA bloqueia o cliente).
 * Só atua no modo Supabase (DADOS._cfg.supabaseUrl preenchido).
 * =========================================================================== */
(function(){
"use strict";
function cfg(){ return (typeof DADOS!=="undefined" && DADOS._cfg) ? DADOS._cfg : {}; }
if(!cfg().supabaseUrl){ return; } // modo demo: gating inerte

var TRIAL_DAYS  = Number(cfg().trialDays != null ? cfg().trialDays : 14);
var GATING_ON   = cfg().gating !== false;
var PRICE_LABEL = cfg().precoLabel || "R$ 49,90/mês";
var DAY = 86400000;
var STATE = { ready:false, admin:false, status:"none", active:false, pastDue:false,
              trialValid:false, daysLeft:null, blocked:false };

/* ---------- checkout: pega a sessão → criar-checkout → redireciona ---------- */
window.assinar = function(opts){
  opts = opts || {};
  var C = cfg(), SB = window.SUPA;
  if(!SB || !C.supabaseUrl){ alert("Assinatura disponível apenas no modo nuvem."); return; }
  var btn = opts.btn || null, prev = null;
  if(btn){ prev = btn.innerHTML; btn.disabled = true; btn.style.opacity=".7"; btn.style.cursor="progress"; btn.innerHTML = "Abrindo checkout…"; }
  function fail(m){ if(btn){ btn.disabled=false; btn.style.opacity=""; btn.style.cursor=""; btn.innerHTML=prev; } alert(m || "Falha ao iniciar assinatura. Tente novamente."); }
  SB.auth.getSession().then(function(s){
    var token = s && s.data && s.data.session ? s.data.session.access_token : null;
    if(!token){ fail("Sua sessão expirou. Entre novamente para assinar."); return; }
    var back = location.origin + location.pathname;
    return fetch(C.supabaseUrl.replace(/\/+$/,"") + "/functions/v1/criar-checkout",{
      method:"POST",
      headers:{ "Content-Type":"application/json", "apikey":C.supabaseKey||"", "Authorization":"Bearer "+token },
      body: JSON.stringify({ success_url: back+"?assinatura=ok", cancel_url: back+"?assinatura=cancelada" })
    }).then(function(r){ return r.json().catch(function(){ return {}; }); }).then(function(j){
      if(j && j.url){ location.href = j.url; }
      else { fail(j && j.error ? ("Não foi possível abrir o checkout: "+j.error) : null); }
    });
  }).catch(function(){ fail(); });
};

/* ---------- estado a partir do status real ---------- */
function compute(user, perfil, assina){
  STATE.admin   = !!(perfil && perfil.is_admin);
  STATE.status  = (assina && assina.status) || "none";
  STATE.active  = (STATE.status === "active" || STATE.status === "trialing");
  STATE.pastDue = (STATE.status === "past_due");

  var created = (user && user.created_at) ? new Date(user.created_at) : null;
  if(created && !isNaN(created.getTime())){
    STATE.daysLeft = Math.ceil((created.getTime() + TRIAL_DAYS*DAY - Date.now()) / DAY);
  } else { STATE.daysLeft = null; }
  STATE.trialValid = (TRIAL_DAYS > 0 && STATE.daysLeft != null && STATE.daysLeft > 0);

  // Bloqueia só quando: gating ligado, não-admin, sem assinatura ativa, não past_due
  // (past_due sempre libera) e fora do grace de cortesia.
  STATE.blocked = GATING_ON && !STATE.admin && !STATE.active && !STATE.pastDue && !STATE.trialValid;
  STATE.ready = true;
}

/* ---------- CSS vivo (tokens VIZIO) injetado uma vez ---------- */
function ensureCss(){
  if(document.getElementById("vzGateCss")) return;
  var s = document.createElement("style"); s.id = "vzGateCss";
  s.textContent =
    "@keyframes vzGateFade{from{opacity:0}to{opacity:1}}"+
    "@keyframes vzGateRise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}"+
    "@keyframes vzGateBreath{0%,100%{transform:scale(1);box-shadow:0 18px 50px rgba(28,100,240,.28)}50%{transform:scale(1.012);box-shadow:0 26px 70px rgba(28,100,240,.42)}}"+
    "@keyframes vzGateOrbit{0%{transform:translateX(-50%) rotate(0deg)}100%{transform:translateX(-50%) rotate(360deg)}}"+
    "@keyframes vzGatePulse{0%,100%{opacity:.5}50%{opacity:1}}"+
    "@keyframes vzGateShimmer{0%{background-position:-160% 0}100%{background-position:260% 0}}"+
    "#vzGateOverlay{position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;padding:24px;"+
      "background:radial-gradient(120% 120% at 50% -10%,rgba(28,100,240,.22),rgba(10,14,24,.62) 60%);"+
      "backdrop-filter:blur(7px) saturate(115%);-webkit-backdrop-filter:blur(7px) saturate(115%);animation:vzGateFade .35s ease both;font-family:'Inter',system-ui,sans-serif}"+
    "#vzGateCard{position:relative;max-width:430px;width:100%;background:#fff;border-radius:20px;padding:34px 30px 28px;text-align:center;"+
      "border:1px solid #E4E8EF;animation:vzGateRise .5s cubic-bezier(.2,.8,.2,1) both,vzGateBreath 6s ease-in-out 1s infinite;overflow:hidden}"+
    "#vzGateCard::before{content:'';position:absolute;top:-46%;left:50%;width:150%;height:150%;transform:translateX(-50%);"+
      "background:conic-gradient(from 0deg,rgba(28,100,240,0),rgba(90,160,255,.16),rgba(28,100,240,0) 40%);animation:vzGateOrbit 14s linear infinite;pointer-events:none}"+
    "#vzGateCard>*{position:relative;z-index:1}"+
    ".vzGateRing{width:62px;height:62px;margin:0 auto 16px;border-radius:50%;display:flex;align-items:center;justify-content:center;"+
      "background:linear-gradient(135deg,#1C64F0,#3C94FC);color:#fff;box-shadow:0 8px 22px rgba(28,100,240,.4);animation:vzGatePulse 2.6s ease-in-out infinite}"+
    "#vzGateCard h3{margin:0 0 6px;font-size:1.32rem;font-weight:800;color:#0E1726;letter-spacing:-.01em}"+
    "#vzGateCard p{margin:0 auto 18px;font-size:.9rem;line-height:1.5;color:#475467;max-width:330px}"+
    ".vzGatePrice{font-size:.78rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1C64F0;margin-bottom:14px}"+
    ".vzGateBtn{display:inline-block;border:0;cursor:pointer;background:linear-gradient(120deg,#1C64F0,#3C94FC 60%,#1C64F0);background-size:220% 100%;"+
      "color:#fff;font-weight:700;font-size:.96rem;padding:13px 26px;border-radius:11px;box-shadow:0 10px 26px rgba(28,100,240,.34);"+
      "animation:vzGateShimmer 3.4s linear infinite;transition:transform .15s ease}"+
    ".vzGateBtn:hover{transform:translateY(-1px)}"+
    ".vzGateExit{display:block;margin-top:16px;font-size:.78rem;color:#98A2B3;text-decoration:none}"+
    ".vzGateExit:hover{color:#667085}"+
    "#vzGateBar{position:relative;z-index:30;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;"+
      "padding:10px 16px;font:600 .85rem 'Inter',system-ui,sans-serif;color:#10141F;"+
      "background:linear-gradient(90deg,#FBF1DC,#FCE9C0,#FBF1DC);background-size:200% 100%;animation:vzGateShimmer 5s linear infinite;"+
      "border-bottom:1px solid #F0D69A}"+
    "#vzGateBar.info{color:#0E2A66;background:linear-gradient(90deg,#E7EFFE,#DCE9FF,#E7EFFE)}"+
    "#vzGateBar .dot{width:8px;height:8px;border-radius:50%;background:#D97706;animation:vzGatePulse 1.6s ease-in-out infinite}"+
    "#vzGateBar.info .dot{background:#1C64F0}"+
    "#vzGateBar .b{cursor:pointer;border:0;background:#10141F;color:#fff;font-weight:700;font-size:.8rem;padding:6px 14px;border-radius:8px}"+
    "#vzGateBar.info .b{background:#1C64F0}";
  document.head.appendChild(s);
}

/* ---------- banner (past_due âmbar / grace azul) ---------- */
function renderBanner(){
  var ex = document.getElementById("vzGateBar"); if(ex) ex.remove();
  if(STATE.admin || STATE.active) return;             // sem banner p/ admin/assinante
  var msg, cls, label;
  if(STATE.pastDue){
    msg = "Pagamento pendente — regularize para manter o acesso."; cls = ""; label = "Regularizar";
  } else if(STATE.trialValid && !STATE.blocked){
    msg = "Período de cortesia — " + STATE.daysLeft + " dia(s) restante(s). Assine para não perder o acesso."; cls = "info"; label = "Assinar";
  } else { return; }
  ensureCss();
  var bar = document.createElement("div"); bar.id = "vzGateBar"; if(cls) bar.className = cls;
  bar.innerHTML = '<span class="dot"></span><span>'+msg+'</span><button class="b" type="button">'+label+'</button>';
  document.body.insertBefore(bar, document.body.firstChild);
  bar.querySelector(".b").onclick = function(){
    if(window.navigate) window.navigate("assinatura"); else window.assinar({btn:this});
  };
}

/* ---------- overlay de bloqueio suave ---------- */
function renderOverlay(){
  var ex = document.getElementById("vzGateOverlay");
  if(!STATE.blocked){ if(ex) ex.remove(); return; }
  if(ex) return;                                       // já está no ar
  ensureCss();
  var ov = document.createElement("div"); ov.id = "vzGateOverlay";
  ov.innerHTML =
    '<div id="vzGateCard" role="dialog" aria-modal="true" aria-label="Assinatura necessária">'+
      '<div class="vzGateRing">'+
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+
        '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'+
      '</div>'+
      '<div class="vzGatePrice">Plano mensal · '+PRICE_LABEL+'</div>'+
      '<h3>Assine para acessar</h3>'+
      '<p>Seu acesso ao Gerenciador de Financiamento está pausado. Reative em segundos — seus dados continuam salvos e voltam exatamente como estavam.</p>'+
      '<button class="vzGateBtn" type="button" id="vzGateGo">Assinar agora</button>'+
      '<a href="javascript:void(0)" class="vzGateExit" id="vzGateOut">Sair da conta</a>'+
    '</div>';
  document.body.appendChild(ov);
  var go = document.getElementById("vzGateGo");
  if(go) go.onclick = function(){ window.assinar({btn:go}); };
  var out = document.getElementById("vzGateOut");
  if(out) out.onclick = function(){ if(window.logout) window.logout(); };
}

/* ---------- defesa em profundidade: bloqueia ações de edição ---------- */
function gateToast(){
  ensureCss();
  var t = document.createElement("div");
  t.textContent = "Assine para continuar — seu acesso está pausado.";
  t.style.cssText = "position:fixed;bottom:22px;left:50%;transform:translateX(-50%);background:#10141F;color:#fff;"+
    "padding:12px 20px;border-radius:10px;font:600 .86rem 'Inter',system-ui,sans-serif;z-index:9200;box-shadow:0 8px 24px rgba(0,0,0,.3);max-width:90vw;text-align:center;animation:vzGateRise .3s ease both";
  document.body.appendChild(t);
  setTimeout(function(){ t.remove(); }, 3000);
  renderOverlay();
}
function wrapCrud(){
  if(!window.CRUD || window.CRUD.__gated) return;
  ["save","gerar","importCSV","add","saveCfg","togglePago"].forEach(function(fn){
    var orig = window.CRUD[fn];
    if(typeof orig !== "function") return;
    window.CRUD[fn] = function(){ if(STATE.blocked){ gateToast(); return; } return orig.apply(this, arguments); };
  });
  window.CRUD.__gated = true;
}

/* ---------- ciclo ---------- */
function apply(){ wrapCrud(); renderBanner(); renderOverlay(); }

function refresh(){
  var SB = window.SUPA; if(!SB) return;
  SB.auth.getUser().then(function(r){
    var user = r && r.data && r.data.user;
    if(!user){ // deslogado: limpa tudo
      STATE.ready = false; STATE.blocked = false;
      var b=document.getElementById("vzGateBar"); if(b)b.remove();
      var o=document.getElementById("vzGateOverlay"); if(o)o.remove();
      return;
    }
    return Promise.all([
      SB.from("fin_perfis").select("is_admin").maybeSingle(),
      SB.from("fin_assinaturas").select("status,current_period_end").maybeSingle()
    ]).then(function(res){
      compute(user, (res[0] && res[0].data) || {}, (res[1] && res[1].data) || {});
      apply();
    });
  }).catch(function(){ /* falha aberta: nunca bloqueia */ });
}

/* ---------- retorno do Stripe (?assinatura=ok|cancelada) ---------- */
function handleReturn(){
  var q = location.search || "";
  if(q.indexOf("assinatura=") < 0) return;
  var ok = /assinatura=ok/.test(q);
  ensureCss();
  var t = document.createElement("div");
  t.textContent = ok ? "Pagamento recebido! Ativando seu acesso…" : "Checkout cancelado. Você pode assinar quando quiser.";
  t.style.cssText = "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:9300;color:#fff;"+
    "padding:12px 22px;border-radius:11px;font:700 .88rem 'Inter',system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.25);"+
    "animation:vzGateRise .35s ease both;background:"+(ok?"linear-gradient(120deg,#16A34A,#22C55E)":"#475467");
  document.body.appendChild(t);
  setTimeout(function(){ t.style.transition="opacity .5s"; t.style.opacity="0"; setTimeout(function(){ t.remove(); }, 500); }, ok?4200:3200);
  // limpa a URL para não repetir o toast num reload
  try{ history.replaceState(null,"",location.origin+location.pathname); }catch(e){}
  // o webhook pode levar 1–3s: re-checa o status algumas vezes
  if(ok){ [1500,4000,8000].forEach(function(ms){ setTimeout(refresh, ms); }); }
}

function init(){
  if(!window.SUPA){ setTimeout(init, 400); return; }
  window.SUPA.auth.onAuthStateChange(function(){ setTimeout(refresh, 350); });
  var _start = window.startApp;
  window.startApp = function(){ if(_start) _start(); setTimeout(refresh, 250); };
  setTimeout(refresh, 900);   // sessão persistida
  handleReturn();
}
init();
})();
