// /functions/poll_pix_bb/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // API BB - chave Pix estática
    const CHAVE_PIX = Deno.env.get("CHAVE_PIX")!;
    const BB_API_URL = `https://api-pix.bb.com.br/pix/v2/recebidos?chave=${CHAVE_PIX}&status=LIQUIDADO`;
    const BB_TOKEN = Deno.env.get("BB_BEARER_TOKEN")!; // token OAuth do BB

    // Buscar Pix recebidos do BB
    const resp = await fetch(BB_API_URL, {
      headers: { Authorization: `Bearer ${BB_TOKEN}` },
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Erro ao consultar API BB:", txt);
      return new Response(JSON.stringify({ error: txt }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
    }

    const pixBb = await resp.json(); // array de Pix

    const results = [];

    for (const pix of pixBb) {
      const txid = pix.txid || pix.endToEndId;
      const valor = parseFloat(pix.valor) || 0;
      const info_pagador = pix.devedor?.nome || "Desconhecido";
      const horario = pix.horario || new Date().toISOString();

      // Inserir no Supabase, ignorando duplicados
      const { data, error } = await supabase
        .from("pix_recebidos")
        .insert([{ txid, valor, info_pagador, horario }])
        .select();

      if (error) {
        if (error.code === "23505") results.push({ txid, status: "duplicado" });
        else results.push({ txid, status: "erro", message: error.message });
      } else {
        results.push({ txid, status: "salvo", data });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });

  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
