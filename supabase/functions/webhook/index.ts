// /functions/webhook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // 🔐 Autorização
    const auth = req.headers.get("authorization");
    if (!auth || auth !== `Bearer ${Deno.env.get("PAINEL_SECRET")}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    // 📥 Lê o payload
    const body = await req.json();
    console.log("📩 Webhook recebido:", body);

    if (!body.pix || body.pix.length === 0) {
      return new Response(
        JSON.stringify({ success: false, message: "Nenhum PIX no payload" }),
        { status: 200 }
      );
    }

    const evento = body.pix[0];

    const valor = parseFloat(evento.valor ?? "0");
    const pagador = evento.pagador?.nome || "Desconhecido";
    const horario = evento.horario || new Date().toISOString();
    const infoPagador = evento.infoPagador || null;

    // 🆔 TXID sempre único (não salvar "sem-txid")
    const txidFinal = evento.txid && evento.txid !== "sem-txid"
      ? evento.txid
      : evento.endToEndId || crypto.randomUUID();

    // 🔗 Conecta ao Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 💾 Insere no banco
    const { data, error } = await supabase
      .from("pix_recebidos")
      .insert({
        valor,
        pagador,
        horario,
        txid: txidFinal,
        info_pagador: infoPagador
      })
      .select()
      .single();

    if (error) {
      // Trata duplicidade sem quebrar o webhook
      if (error.code === "23505") {
        console.log("⚠ PIX duplicado ignorado:", txidFinal);
        return new Response(JSON.stringify({ success: true, duplicated: true }), {
          status: 200
        });
      }

      console.error("Erro ao salvar PIX:", error);
      return new Response(
        JSON.stringify({ error: "Erro ao salvar PIX", details: error }),
        { status: 500 }
      );
    }

    console.log("💾 PIX salvo:", data);

    // 📡 Envia broadcast
    await supabase.channel("pix_channel").send({
      type: "broadcast",
      event: "novo_pix",
      payload: data
    });

    return new Response(JSON.stringify({ success: true, data }), { status: 200 });

  } catch (err) {
    console.error("Erro no webhook:", err);
    return new Response(
      JSON.stringify({ error: "Erro desconhecido", details: err?.message || err }),
      { status: 500 }
    );
  }
});
