import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(url, serviceKey);

    // Espera receber o payload do Banco do Brasil
    const body = await req.json();

    if (!body.pix || !Array.isArray(body.pix)) {
      return new Response(
        JSON.stringify({ error: "Payload inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const results = [];

    for (const pix of body.pix) {
      // Usa txid do banco, ou fallback para endToEndId
      const txid = pix.txid && pix.txid !== "sem-txid" ? pix.txid : pix.endToEndId;

      // Tenta inserir no banco
      const { data, error } = await supabase
        .from("pix_recebidos")
        .insert([
          {
            txid,
            valor: parseFloat(pix.valor),
            pagador: pix.pagador?.nome || "Desconhecido",
            horario: pix.horario || new Date().toISOString(),
            info_pagador: pix.infoPagador || null
          }
        ])
        .select();

      if (error) {
        if (error.code === "23505") {
          // Duplicate key, ignora
          console.log(`PIX com txid ${txid} já existe, ignorando`);
          results.push({ txid, status: "duplicado" });
        } else {
          console.error("Erro ao salvar PIX:", error);
          results.push({ txid, status: "erro", message: error.message });
        }
      } else {
        results.push({ txid, status: "salvo", data });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error("Erro interno na função PIX:", err);
    return new Response(
      JSON.stringify({ error: "Falha interna" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
