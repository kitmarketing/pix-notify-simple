// /functions/poll_pix_bb/index.ts - COM RENOVAÇÃO AUTOMÁTICA DE TOKEN
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Função para renovar token do BB
async function renovarTokenBB(): Promise<string | null> {
  const BB_CLIENT_ID = Deno.env.get("BB_CLIENT_ID");
  const BB_CLIENT_SECRET = Deno.env.get("BB_CLIENT_SECRET");
  
  if (!BB_CLIENT_ID || !BB_CLIENT_SECRET) {
    console.error("Credenciais BB não configuradas");
    return null;
  }

  const tokenUrl = "https://oauth.bb.com.br/oauth/token";
  const credentials = btoa(`${BB_CLIENT_ID}:${BB_CLIENT_SECRET}`);

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=pix.read pix.write",
    });

    if (!response.ok) {
      console.error(`Erro ao renovar token: ${response.status}`);
      return null;
    }

    const data = await response.json();
    console.log("✅ Token renovado com sucesso!");
    return data.access_token;
  } catch (error) {
    console.error("Erro ao renovar token:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Supabase
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const CHAVE_PIX = Deno.env.get("CHAVE_PIX")!;
    const BB_API_URL = `https://api-pix.bb.com.br/pix/v2/recebidos?chave=${CHAVE_PIX}&status=LIQUIDADO`;
    
    // Tentar usar token existente
    let BB_TOKEN: string | null | undefined = Deno.env.get("BB_BEARER_TOKEN");

    // Primeira tentativa de buscar PIX
    let resp = await fetch(BB_API_URL, {
      headers: { Authorization: `Bearer ${BB_TOKEN}` },
    });

    // Se retornou 401 (não autorizado), o token expirou
    if (resp.status === 401) {
      console.log("⚠️ Token expirado, renovando...");
      
      // Renovar token
      BB_TOKEN = await renovarTokenBB();
      
      if (!BB_TOKEN) {
        return new Response(
          JSON.stringify({ 
            error: "Não foi possível renovar o token",
            detalhes: "Verifique BB_CLIENT_ID e BB_CLIENT_SECRET"
          }), 
          { 
            headers: { ...corsHeaders, "Content-Type": "application/json" }, 
            status: 500 
          }
        );
      }

      // Tentar novamente com novo token
      resp = await fetch(BB_API_URL, {
        headers: { Authorization: `Bearer ${BB_TOKEN}` },
      });
    }

    if (!resp.ok) {
      const txt = await resp.text();
      console.error("Erro ao consultar API BB:", txt);
      return new Response(
        JSON.stringify({ error: txt }), 
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: 500 
        }
      );
    }

    const pixBb = await resp.json();
    const results = [];

    // Processar cada PIX recebido
    for (const pix of pixBb) {
      const txid = pix.txid || pix.endToEndId;
      const valor = parseFloat(pix.valor) || 0;
      const info_pagador = pix.devedor?.nome || "Desconhecido";
      const horario = pix.horario || new Date().toISOString();

      // Inserir no Supabase
      const { data, error } = await supabase
        .from("pix_recebidos")
        .insert([{ txid, valor, info_pagador, horario }])
        .select();

      if (error) {
        if (error.code === "23505") {
          results.push({ txid, status: "duplicado" });
        } else {
          results.push({ txid, status: "erro", message: error.message });
        }
      } else {
        results.push({ txid, status: "salvo", data });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        results,
        token_renovado: resp.status === 401 ? true : false
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (err) {
    console.error("Erro interno:", err);
    return new Response(
      JSON.stringify({ 
        error: err instanceof Error ? err.message : String(err) 
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      }
    );
  }
});
