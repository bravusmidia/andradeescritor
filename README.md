# Andrade Escritor

Site oficial do escritor Andrade (@andradeescritor): pensamentos, frases, textos e poesias.

Online em https://bravusmidia.github.io/andradeescritor/

Site estático (HTML, CSS e JavaScript) com banco de dados no Supabase.

- **Escrever e publicar:** clique em *Entrar*, faça login como autor e use *Painel do autor → Publicações → + Nova publicação*. Rascunhos, textos de membros e a seção *Sobre* também ficam no painel.
- **Banco:** tabela `escritor_docs` (projeto Supabase compartilhado, tabelas isoladas com prefixo `escritor_`). Quem pode ler ou escrever cada item é decidido por regras no servidor (RLS). Autores ficam em `escritor_admins`, membros em `escritor_membros`.
- **Recanto das Letras:** `scripts/recanto_sync.py` roda no GitHub Actions a cada 3 horas e atualiza `recanto-data.js`.
- Os 4 textos iniciais ficam na lista `BASE` em `app.js`.
