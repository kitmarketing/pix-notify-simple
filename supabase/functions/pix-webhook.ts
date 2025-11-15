import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// Cliente Supabase com Service Role Key (não expor no frontend)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Endpoint unificado
serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const body = await req.json();

    // --------------------
    // Webhook de pagamento
    // --------------------
    if (body.type === "webhook" || body.kiwify_event) {
      console.log("Recebido webhook:", body);

      // Registrar no Supabase
      await supabase.from("pix_webhooks").insert([
        { payload: body, received_at: new Date().toISOString() },
      ]);

      return new Response(
        JSON.stringify({ status: "ok", source: "webhook" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // --------------------
    // Consulta PIX múltipla
    // --------------------
    if (body.type === "consulta_pix" && Array.isArray(body.pix)) {
      console.log("Consulta PIX múltipla:", body.pix);

      const resultados = [];

      for (const p of body.pix) {
        try {
          const pixResponse = await fetch("https://api-pix-do-banco.com/consulta", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("PIX_API_KEY")}`
            },
            body: JSON.stringify({ txid: p.txid, chave: p.chave })
          });

          if (!pixResponse.ok) {
            const errorText = await pixResponse.text();
            console.error("Erro PIX:", errorText);
            resultados.push({ ...p, status: "erro", details: errorText });
            continue;
          }

          const pixData = await pixResponse.json();
          resultados.push({ ...p, status: "ok", data: pixData });
        } catch (err) {
          console.error("Falha consulta PIX:", err);
          resultados.push({ ...p, status: "erro", details: err.message });
        }
      }

      return new Response(
        JSON.stringify({ status: "ok", pix: resultados }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Tipo de requisição não identificado", { status: 400 });
  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { headers: { "Content-Type": "application/json" }, status: 500 }
    );
  }
});
