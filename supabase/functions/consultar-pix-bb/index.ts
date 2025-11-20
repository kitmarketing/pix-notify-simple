import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConsultarPixParams {
  bearerToken?: string;
  e2eid?: string;
  dataInicio?: string;
  dataFim?: string;
  ambiente?: 'sandbox' | 'producao';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bearerToken, e2eid, dataInicio, dataFim, ambiente = 'producao' }: ConsultarPixParams = await req.json();

    // Definir URL base do seu servidor proxy
    const baseUrl = ambiente === 'sandbox'
      ? 'https://pix.zapinteligente.com/sandbox'
      : 'https://pix.zapinteligente.com';

    let url: string;

    // Consultar Pix específico
    if (e2eid) {
      url = `${baseUrl}/pix/${e2eid}`;
      console.log(`Consultando Pix específico: ${e2eid}`);
    } else {
      const params = new URLSearchParams();
      if (dataInicio) params.append('inicio', dataInicio);
      if (dataFim) params.append('fim', dataFim);
      url = `${baseUrl}/pix${params.toString() ? '?' + params.toString() : ''}`;
      console.log(`Consultando Pix recebidos: ${url}`);
    }

    // Fazer requisição ao servidor proxy
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': bearerToken ? `Bearer ${bearerToken}` : '',
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`Erro HTTP ${response.status}:`, data);
      return new Response(
        JSON.stringify({
          error: "Erro ao consultar servidor proxy",
          detalhes: data,
          status: response.status,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: response.status }
      );
    }

    console.log(`Consulta realizada com sucesso. Status: ${response.status}`);

    return new Response(
      JSON.stringify({
        sucesso: true,
        ambiente,
        dados: data,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );

  } catch (err) {
    console.error("Erro interno na função:", err);
    return new Response(
      JSON.stringify({
        error: "Erro interno ao processar requisição",
        detalhes: err instanceof Error ? err.message : String(err)
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
