/* ===========================================================================
 * Gerenciador de Financiamento by VIZIO — Modo Supabase (auth real + dados na nuvem)
 * Carregado por último (depois do index inline e do app-crud.js).
 * Ativa SOMENTE quando DADOS._cfg.supabaseUrl está preenchido — senão fica inerte
 * (o demo segue em modo aberto, sem cadastro).
 * - Login: Supabase Auth (e-mail + senha) · Recuperar senha · Alterar senha
 * - Dados: lê/grava nas tabelas fin_* (RLS isola por usuário)
 * =========================================================================== */
(function(){
"use strict";
var CFG = (window.DADOS && DADOS._cfg) ? DADOS._cfg : {};
if(!CFG.supabaseUrl || !window.supabase){ return; }   // modo demo/Apps Script: não faz nada

var SB = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
window.SUPA = SB;

var MAP = {
  entrada:      {t:"fin_entrada",       arr:"entrada", cols:["parcela","venc","valor","pago","reajuste","quitado","status"]},
  doc:          {t:"fin_doc",           arr:"doc",     cols:["parcela","rtbi","cartorio","total","quitado","status"]},
  obra:         {t:"fin_obra",          arr:"juros",   cols:["parcela","venc","valor","evolucao","total","quitado","status"]},
  financiamento:{t:"fin_financiamento", arr:"fin",     cols:["parcela","mes","valor","amort","saldo","quitado","status"]}
};
var NUMCOLS=["valor","pago","reajuste","rtbi","cartorio","total","amort","saldo"];
function recToRow(id,e){ var m=MAP[id],o={}; m.cols.forEach(function(c){ var v=e[c];
  if(c==="quitado")v=!!v; else if(c==="evolucao")v=(v==null||v==="")?null:String(v);
  o[c]=(v===undefined?null:v); }); return o; }
function rowToRec(id,row){ var m=MAP[id],e={_id:row.id}; m.cols.forEach(function(c){ var v=row[c];
  if(c==="quitado")v=(v===true); else if(c==="evolucao")v=(v==null||v==="")?null:parseFloat(v);
  else if(NUMCOLS.indexOf(c)>=0)v=(v==null?null:Number(v)); e[c]=v; }); return e; }

var UID=null;

window.VZSUPA={
  active:true,
  persist:function(id,action,e){
    var m=MAP[id];
    if(action==="create") return SB.from(m.t).insert(recToRow(id,e)).select().single().then(function(r){ if(r.data)e._id=r.data.id; });
    if(action==="update"){ if(e._id) return SB.from(m.t).update(recToRow(id,e)).eq("id",e._id); return Promise.resolve(); }
    if(action==="delete"){ if(e._id) return SB.from(m.t).delete().eq("id",e._id); return Promise.resolve(); }
    return Promise.resolve();
  },
  replaceModule:function(id,rows){ var m=MAP[id];
    return SB.from(m.t).delete().not("id","is",null).then(function(){
      var payload=rows.map(function(e,i){ var o=recToRow(id,e); o.ordem=i; return o; });
      if(!payload.length) return;
      return SB.from(m.t).insert(payload).select("id").then(function(r){ if(r.data) r.data.forEach(function(row,i){ rows[i]._id=row.id; }); });
    });
  },
  saveCfg:function(id,c){ if(!UID)return Promise.resolve();
    return SB.from("fin_config").upsert({user_id:UID,modulo:id,total:c.total||0,forma:c.forma||"parcelado",nparc:c.nParc||0,tipo:c.tipo||"fixa",taxa:c.taxa||0,meses:c.meses||0,data:c.data||""},{onConflict:"user_id,modulo"}).then(function(){});
  },
  reset:function(email){ return SB.auth.resetPasswordForEmail(email,{redirectTo:location.href.split("#")[0]}); },
  changePass:function(np){ return SB.auth.updateUser({password:np}); }
};

function loadAll(){
  return Promise.all([
    SB.from("fin_perfis").select("*").maybeSingle(),
    SB.from("fin_config").select("*"),
    SB.from("fin_entrada").select("*").order("ordem"),
    SB.from("fin_doc").select("*").order("ordem"),
    SB.from("fin_obra").select("*").order("ordem"),
    SB.from("fin_financiamento").select("*").order("ordem")
  ]).then(function(res){
    var perfil=res[0].data||{};
    DADOS.entrada=(res[2].data||[]).map(function(r){return rowToRec("entrada",r);});
    DADOS.doc    =(res[3].data||[]).map(function(r){return rowToRec("doc",r);});
    DADOS.juros  =(res[4].data||[]).map(function(r){return rowToRec("obra",r);});
    DADOS.fin    =(res[5].data||[]).map(function(r){return rowToRec("financiamento",r);});
    DADOS._cfgMod={};
    (res[1].data||[]).forEach(function(cf){ DADOS._cfgMod[cf.modulo]={total:Number(cf.total)||0,forma:cf.forma,nParc:cf.nparc,tipo:cf.tipo,taxa:Number(cf.taxa)||0,meses:cf.meses,data:cf.data}; });
    if(window.CRUD&&CRUD.recompute)CRUD.recompute();
    return perfil;
  });
}
function entrar(perfil,email){
  if(window.setSession) window.setSession({nome:perfil.nome||email, perfil:perfil.papel||"proprietario", user:email, roleLabel:perfil.prop_label||""});
}

/* ----- login (substitui o doLogin do index) ----- */
window.doLogin=function(ev){ ev.preventDefault();
  var email=(document.getElementById("u").value||"").trim();
  var pass=document.getElementById("p").value;
  var err=document.getElementById("loginErr"); err.textContent="Entrando…";
  SB.auth.signInWithPassword({email:email,password:pass}).then(function(r){
    if(r.error){ err.textContent="E-mail ou senha inválidos."; return; }
    UID=r.data.user.id;
    loadAll().then(function(perfil){ entrar(perfil,email); }).catch(function(){ err.textContent="Erro ao carregar seus dados."; });
  });
  return false;
};
window.logout=function(){ SB.auth.signOut().finally(function(){ try{sessionStorage.removeItem("vizio_fin_sess");}catch(e){} location.reload(); }); };

/* ----- recuperação de senha (link do e-mail volta com type=recovery) ----- */
SB.auth.onAuthStateChange(function(evt){
  if(evt==="PASSWORD_RECOVERY"){
    var np=prompt("Defina sua nova senha (mín. 6 caracteres):");
    if(np&&np.length>=6) SB.auth.updateUser({password:np}).then(function(r){ alert(r.error?("Erro: "+r.error.message):"Senha alterada! Entre com a nova senha."); });
  }
});

/* ----- sessão persistida: se já está logado, entra direto ----- */
SB.auth.getSession().then(function(s){
  if(s.data&&s.data.session){ UID=s.data.session.user.id; var email=s.data.session.user.email;
    loadAll().then(function(perfil){ entrar(perfil,email); }); }
});

/* ----- UI: tela de login (e-mail + esqueci senha) e botão alterar senha ----- */
function injectLoginUI(){
  var u=document.getElementById("u"); if(u){ u.type="email"; u.placeholder="seu@email.com"; }
  var lbls=document.querySelectorAll("#login .field label"); if(lbls[0])lbls[0].textContent="E-mail";
  var hint=document.getElementById("lgHint");
  if(hint){ hint.innerHTML='<a href="javascript:void(0)" id="lgForgot" style="color:#1C64F0;font-weight:700;text-decoration:none">Esqueci minha senha</a>'; }
  var fg=document.getElementById("lgForgot");
  if(fg)fg.onclick=function(){ var em=prompt("Digite seu e-mail para receber o link de recuperação:",(document.getElementById("u").value||"")); if(em){ window.VZSUPA.reset(em).then(function(r){ alert(r.error?("Erro: "+r.error.message):("Enviamos um link de recuperação para "+em+". Confira seu e-mail.")); }); } };
}
if(document.readyState!=="loading")injectLoginUI(); else document.addEventListener("DOMContentLoaded",injectLoginUI);

var _startApp=window.startApp;
window.startApp=function(){ if(_startApp)_startApp();
  var bar=document.querySelector(".topbar .user");
  if(bar&&!document.getElementById("btnPass")){
    var b=document.createElement("button"); b.id="btnPass"; b.className="out"; b.title="Alterar senha"; b.style.marginRight="2px";
    b.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
    b.onclick=function(){ var np=prompt("Defina sua nova senha (mín. 6 caracteres):"); if(np&&np.length>=6){ window.VZSUPA.changePass(np).then(function(r){ alert(r.error?("Erro: "+r.error.message):"Senha alterada com sucesso."); }); } };
    var out=bar.querySelector("button.out"); if(out)bar.insertBefore(b,out); else bar.appendChild(b);
  }
};
})();
