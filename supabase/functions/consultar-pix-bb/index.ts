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
    const { 
      bearerToken, 
      e2eid, 
      dataInicio, 
      dataFim, 
      ambiente = 'producao' 
    }: ConsultarPixParams = await req.json();

    // Usar o Bearer Token fornecido ou o do ambiente
    const token = bearerToken || Deno.env.get("BB_BEARER_TOKEN");
    
    if (!token) {
      return new Response(
        JSON.stringify({ 
          error: "Bearer Token não fornecido",
          detalhes: "Forneça o bearerToken no corpo da requisição ou configure BB_BEARER_TOKEN"
        }), 
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: 400 
        }
      );
    }

    // Definir URL base de acordo com o ambiente
    const baseUrl = ambiente === 'sandbox' 
      ? 'https://api.sandbox.bb.com.br/pix/v2'
      : 'https://api-pix.bb.com.br/pix/v2';

    let url: string;
    
    // Consultar Pix específico por e2eid
    if (e2eid) {
      url = `${baseUrl}/pix/${e2eid}`;
      console.log(`Consultando Pix específico: ${e2eid}`);
    } 
    // Consultar todos os Pix com filtros opcionais
    else {
      const params = new URLSearchParams();
      
      if (dataInicio) params.append('inicio', dataInicio);
      if (dataFim) params.append('fim', dataFim);
      
      url = `${baseUrl}/pix${params.toString() ? '?' + params.toString() : ''}`;
      console.log(`Consultando Pix recebidos: ${url}`);
    }

    // Fazer requisição à API do BB
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();

    // Tratamento de erros HTTP
    if (!response.ok) {
      console.error(`Erro HTTP ${response.status}:`, data);
      
      let errorMessage = "Erro ao consultar API do Banco do Brasil";
      let errorDetails = data;

      switch (response.status) {
        case 403:
          errorMessage = "Acesso Negado";
          errorDetails = "Token inválido ou sem permissões necessárias";
          break;
        case 404:
          errorMessage = "Não Encontrado";
          errorDetails = e2eid 
            ? `Pix com e2eid ${e2eid} não foi encontrado`
            : "Endpoint não encontrado";
          break;
        case 422:
          errorMessage = "Erro Negocial";
          errorDetails = "Dados fornecidos são inválidos ou não atendem às regras de negócio";
          break;
        case 500:
          errorMessage = "Erro Interno do Servidor";
          errorDetails = "O servidor do Banco do Brasil encontrou um erro interno";
          break;
        case 503:
          errorMessage = "Serviço Indisponível";
          errorDetails = "A API do Banco do Brasil está temporariamente indisponível";
          break;
      }

      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          detalhes: errorDetails,
          status: response.status,
          dadosOriginais: data
        }), 
        { 
          headers: { ...corsHeaders, "Content-Type": "application/json" }, 
          status: response.status 
        }
      );
    }

    // Sucesso - retornar dados
    console.log(`Consulta realizada com sucesso. Status: ${response.status}`);
    
    return new Response(
      JSON.stringify({ 
        sucesso: true,
        ambiente,
        dados: data,
        timestamp: new Date().toISOString()
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 200 
      }
    );

  } catch (err) {
    console.error("Erro interno na função:", err);
    
    return new Response(
      JSON.stringify({ 
        error: "Erro interno ao processar requisição",
        detalhes: err instanceof Error ? err.message : String(err)
      }), 
      { 
        headers: { ...corsHeaders, "Content-Type": "application/json" }, 
        status: 500 
      }
    );
  }
});
