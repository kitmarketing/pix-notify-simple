// Função poll_pix_bb otimizada - Consulta PIX recebidos periodicamente
// Esta função deve ser chamada por um cron job a cada 1 minuto

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Renovar token BB
async function renovarTokenBB(): Promise<string | null> {
  const BB_CLIENT_ID = Deno.env.get("BB_CLIENT_ID");
  const BB_CLIENT_SECRET = Deno.env.get("BB_CLIENT_SECRET");
  
  if (!BB_CLIENT_ID || !BB_CLIENT_SECRET) {
    console.error("❌ BB_CLIENT_ID ou BB_CLIENT_SECRET não configurados");
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
      const errorText = await response.text();
      console.error(`❌ Erro ao renovar token: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    console.log("✅ Token BB renovado com sucesso!");
    return data.access_token;
  } catch (error) {
    console.error("❌ Erro ao renovar token:", error);
    return null;
  }
}

// Consultar PIX recebidos via servidor proxy
async function consultarPixBB(token: string): Promise<any[]> {
  const CHAVE_PIX = Deno.env.get("CHAVE_PIX");
  
  if (!CHAVE_PIX) {
    throw new Error("CHAVE_PIX não configurada");
  }

  // Consultar PIX das últimas 2 horas (evita reprocessar tudo)
  const agora = new Date();
  const duasHorasAtras = new Date(agora.getTime() - 2 * 60 * 60 * 1000);
  
  const formatarData = (data: Date) => {
    return data.toISOString().replace(/\.\d{3}Z$/, '-03:00');
  };

  const inicio = formatarData(duasHorasAtras);
  const fim = formatarData(agora);

  const url = `https://pix.zapinteligente.com/pix?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`;

  console.log(`📡 Consultando PIX via proxy de ${inicio} até ${fim}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Servidor proxy retornou ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.pix || [];
  } catch (error) {
    console.error("❌ Erro ao consultar PIX via proxy:", error);
    throw error;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("🔄 Iniciando polling de PIX...");

  try {
    // Conectar ao Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Variáveis Supabase não configuradas");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Renovar token do BB
    console.log("🔑 Renovando token do BB...");
    const token = await renovarTokenBB();
    
    if (!token) {
      return new Response(
        JSON.stringify({ 
          error: "Não foi possível obter token do BB",
          detalhes: "Verifique BB_CLIENT_ID e BB_CLIENT_SECRET"
        }), 
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: 500 
        }
      );
    }

    // Consultar PIX recebidos via proxy
    console.log("📥 Consultando PIX via servidor proxy...");
    const pixList = await consultarPixBB(token);
    
    console.log(`📊 Encontrados ${pixList.length} PIX`);

    const results = [];

    // Processar cada PIX
    for (const pix of pixList) {
      const txid = pix.txid || pix.endToEndId || crypto.randomUUID();
      const valor = parseFloat(pix.valor) || 0;
      const info_pagador = pix.pagador?.nome || "Desconhecido";
      const horario = pix.horario || new Date().toISOString();

      // Inserir no banco (ignorar duplicados)
      const { data, error } = await supabase
        .from("pix_recebidos")
        .insert([{ txid, valor, info_pagador, horario }])
        .select();

      if (error) {
        if (error.code === "23505") {
          // Duplicado - PIX já foi processado antes
          results.push({ txid, status: "duplicado" });
        } else {
          console.error(`❌ Erro ao salvar PIX ${txid}:`, error);
          results.push({ txid, status: "erro", message: error.message });
        }
      } else {
        console.log(`✅ PIX salvo: ${txid} - R$ ${valor}`);
        results.push({ txid, status: "salvo", data });
      }
    }

    const novosPixCount = results.filter(r => r.status === "salvo").length;
    const duplicadosCount = results.filter(r => r.status === "duplicado").length;

    console.log(`✨ Polling concluído: ${novosPixCount} novos, ${duplicadosCount} duplicados`);

    return new Response(
      JSON.stringify({ 
        success: true,
        timestamp: new Date().toISOString(),
        pix_consultados: pixList.length,
        pix_novos: novosPixCount,
        pix_duplicados: duplicadosCount,
        results
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (err) {
    console.error("❌ Erro no polling:", err);
    return new Response(
      JSON.stringify({ 
        error: "Erro no polling",
        detalhes: err instanceof Error ? err.message : String(err)
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      }
    );
  }
});
