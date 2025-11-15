import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Crie o cliente Supabase com Service Role Key
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json();

    // Se for webhook
    if (body.type === "webhook" || body.kiwify_event) {
      console.log("Recebido webhook:", body);

      // Exemplo de log no Supabase
      await supabase.from("pix_webhooks").insert([
        { payload: body, received_at: new Date().toISOString() },
      ]);

      return new Response(JSON.stringify({ status: "ok", source: "webhook" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Se for consulta PIX
    if (body.type === "consulta_pix" && body.pix) {
      console.log("Consulta PIX:", body.pix);

      // Aqui você faria a chamada real à API PIX do PSP/Banco
      // Simulando retorno:
      const resultado = body.pix.map((p: any) => ({
        ...p,
        status: "CONCLUIDO",
        confirmadoEm: new Date().toISOString(),
      }));

      return new Response(JSON.stringify({ status: "ok", pix: resultado }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Tipo de requisição não identificado", { status: 400 });
  } catch (err) {
    console.error(err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
