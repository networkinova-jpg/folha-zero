// Função de borda preparada, não publicada.
// Não contém service_role, senha nem SMTP.
// Enquanto o projeto Free não existir, responde que nada foi enviado.
// As decisões testadas no app estão em acesso.js.

Deno.serve(() => new Response(JSON.stringify({
  ok: false,
  motivo: 'projeto_nao_configurado',
  enviouEmail: false
}), {
  status: 503,
  headers: { 'content-type': 'application/json; charset=utf-8' }
}));
