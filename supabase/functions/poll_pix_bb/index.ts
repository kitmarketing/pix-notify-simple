// supabase/functions/poll_pix_bb/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parâmetros de polling
    const url = new URL(req.url);
    const inicio = url.searchParams.get("inicio");
    const fim = url.searchParams.get("fim");

    // URL do seu servidor Node.js (proxy)
    const serverUrl = `https://pix.zapinteligente.com?inicio=${encodeURIComponent(inicio!)}&fim=${encodeURIComponent(fim!)}`;

    // Faz a requisição para o servidor
    const response = await fetch(serverUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("❌ Erro no polling via proxy:", err);
    return new Response(JSON.stringify({
      error: "Erro no polling via proxy",
      detalhes: err.message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
