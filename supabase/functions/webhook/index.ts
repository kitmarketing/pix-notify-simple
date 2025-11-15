// functions/webhook/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const body = await req.json();

    console.log("🔔 Webhook BB Recebido:", JSON.stringify(body));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Banco do Brasil sempre envia body.pix como array
    if (!body.pix || !Array.isArray(body.pix)) {
      console.log("❌ Nenhum PIX no payload");
      return new Response("Payload sem PIX", { status: 400 });
    }

    for (const p of body.pix) {
      const valor = Number(p.valor);
      const pagador = p.pagador?.nome || "DESCONHECIDO";
      const horario = p.horario;
      const txid = p.txid;

      console.log("💾 Salvando PIX:", {
        valor,
        pagador,
        horario,
        txid,
      });

      const { error } = await supabase.from("pix_recebidos").insert({
        valor,
        pagador,
        horario,
        txid,
      });

      if (error) {
        console.error("❌ Erro ao salvar PIX:", error);
      } else {
        console.log("✅ PIX salvo com sucesso!");
      }
    }

    return new Response("OK", { status: 200 });

  } catch (err) {
    console.error("❌ Erro geral:", err);
    return new Response("Erro", { status: 500 });
  }
});
