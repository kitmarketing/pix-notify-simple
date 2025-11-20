import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("🔄 Iniciando polling de PIX via servidor intermediário...");

  try {
    // URL do seu servidor PIX
    const PIX_SERVER_URL = "https://pix.zapinteligente.com";

    // Faz a chamada para o servidor PIX
    const resposta = await fetch(PIX_SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "polling" }), // você pode enviar infos extras se quiser
    });

    if (!resposta.ok) {
      const errorText = await resposta.text();
      throw new Error(`Servidor PIX retornou ${resposta.status}: ${errorText}`);
    }

    const data = await resposta.json();

    console.log("✅ Polling recebido do servidor PIX:", data);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err) {
    console.error("❌ Erro no polling via servidor PIX:", err);
    return new Response(JSON.stringify({
      error: "Erro no polling via servidor PIX",
      detalhes: err instanceof Error ? err.message : String(err)
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
