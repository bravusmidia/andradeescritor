/* Banco de dados do site (Supabase). Tabela escritor_docs, protegida por regras no servidor (RLS).
   A chave abaixo é pública por natureza: quem pode ler ou escrever cada item é decidido no servidor. */
(() => {
"use strict";
const URL_SB = "https://kfoapsxrzfebjyvmvktf.supabase.co";
const KEY_SB = "sb_publishable_fWX65PvnnCqOCfK64KQq5w_gnzN9CQd";
if (!window.supabase || typeof window.supabase.createClient !== "function") return;

const sb = window.supabase.createClient(URL_SB, KEY_SB, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "andradeescritor-auth" }
});
const T = "escritor_docs";

function fail(error){
  const e = new Error(error && error.message || "erro");
  const c = error && error.code;
  e.code = (c === "42501" || c === "PGRST301" || /row-level security|permission/i.test(e.message)) ? "invalid_argument"
         : (c === "23514" ? "invalid_argument" : (error && error.status === 429 ? "resource_exhausted" : "unavailable"));
  return e;
}
const snapDoc = row => ({ id: row.path.split("/")[1], exists: true, data: () => row.dados });

/* Ouvintes: recarregam após cada escrita e a cada 60 s (sem conexão permanente). */
const listeners = new Set();
async function runListener(l){
  try{
    if (l.kind === "col"){
      const { data, error } = await sb.from(T).select("path,dados").eq("colecao", l.name).limit(2000);
      if (error) throw fail(error);
      l.cb({ docs: (data || []).map(snapDoc) });
    } else {
      const { data, error } = await sb.from(T).select("path,dados").eq("path", l.name).maybeSingle();
      if (error) throw fail(error);
      l.cb(data ? snapDoc(data) : { id: l.name.split("/")[1], exists: false, data: () => undefined });
    }
  }catch(err){ if (l.err) l.err(err); }
}
const refreshAll = () => Promise.all([...listeners].map(runListener));
setInterval(() => { if (document.visibilityState === "visible") refreshAll(); }, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshAll(); });

const db = {
  collection(name){
    return { onSnapshot(cb, err){ const l = { kind: "col", name, cb, err }; listeners.add(l); runListener(l); return () => listeners.delete(l); } };
  },
  doc(path){
    return {
      onSnapshot(cb, err){ const l = { kind: "doc", name: path, cb, err }; listeners.add(l); runListener(l); return () => listeners.delete(l); },
      async get(){
        const { data, error } = await sb.from(T).select("path,dados").eq("path", path).maybeSingle();
        if (error) throw fail(error);
        return data ? snapDoc(data) : { exists: false, data: () => undefined };
      },
      async set(dados){
        const { error } = await sb.from(T).upsert({ path, dados }, { onConflict: "path" });
        if (error) throw fail(error);
        refreshAll();
      },
      async delete(){
        const { error } = await sb.from(T).delete().eq("path", path);
        if (error) throw fail(error);
        refreshAll();
      }
    };
  }
};

async function sessionUser(){ const { data } = await sb.auth.getSession(); return data && data.session ? data.session.user : null; }
async function rpcBool(fn){ const { data, error } = await sb.rpc(fn); return !error && data === true; }

window.ESCRITOR_DB = {
  db,
  async user(){
    const u = await sessionUser();
    if (!u) return null;
    return {
      id: async () => u.id,
      canEdit: () => rpcBool("escritor_is_admin"),
      isMember: () => rpcBool("escritor_is_member"),
      me: async () => ({ name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || "Andrade", email: u.email })
    };
  },
  async signIn(email, senha){
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
  },
  async inscrever(nome, email, pais, idioma){
    const { error } = await sb.rpc("escritor_inscrever", { p_nome: nome, p_email: email, p_pais: pais, p_idioma: idioma });
    if (error) throw fail(error);
  },
  async visita(pais){ await sb.rpc("escritor_visita", { p_pais: pais }); },
  async inscritos(){
    const { data, error } = await sb.from("escritor_inscritos").select("id,nome,email,pais,idioma,criado_em").order("criado_em", { ascending: false }).limit(5000);
    if (error) throw fail(error); return data || [];
  },
  async removerInscrito(id){ const { error } = await sb.from("escritor_inscritos").delete().eq("id", id); if (error) throw fail(error); },
  async visitas(){
    const { data, error } = await sb.from("escritor_visitas").select("dia,pais,visitas").order("dia", { ascending: false }).limit(20000);
    if (error) throw fail(error); return data || [];
  },
  async uploadFoto(blob){
    const path = "autor/foto-" + Date.now() + ".jpg";
    const { error } = await sb.storage.from("escritor").upload(path, blob, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
    if (error) throw fail(error);
    return sb.storage.from("escritor").getPublicUrl(path).data.publicUrl;
  },
  async ping(){ const { data, error } = await sb.rpc("escritor_ping"); if (error) throw fail(error); return data; },
  async signOut(){ await sb.auth.signOut(); },
  async resetPassword(email){
    const { error } = await sb.auth.resetPasswordForEmail(email); /* o link abre a tela de nova senha do login compartilhado */
    if (error) throw error;
  }
};
})();
