import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

const connectedClients = new Set<WebSocket>();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // WebSocket connection
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req);
    
    socket.onopen = () => {
      console.log("Cliente WebSocket conectado");
      connectedClients.add(socket);
    };
    
    socket.onclose = () => {
      console.log("Cliente WebSocket desconectado");
      connectedClients.delete(socket);
    };
    
    socket.onerror = (error) => {
      console.error("Erro no WebSocket:", error);
      connectedClients.delete(socket);
    };
    
    return response;
  }

  // Webhook POST
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      console.log('Webhook recebido do Banco do Brasil:', JSON.stringify(body));

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Extrai os dados do PIX do payload do BB
      const pixData = {
        valor: body.pix?.valor || body.valor || 0,
        pagador: body.pix?.pagador?.nome || body.pagador || 'Desconhecido',
        horario: body.pix?.horario || body.horario || new Date().toISOString(),
        txid: body.pix?.txid || body.txid || body.endToEndId || 'sem-txid',
      };

      // Salva no banco
      const { data, error } = await supabase
        .from('pix_recebidos')
        .insert([pixData])
        .select()
        .single();

      if (error) {
        console.error('Erro ao salvar PIX:', error);
        throw error;
      }

      console.log('PIX salvo com sucesso:', data);

      // Notifica todos os clientes conectados via WebSocket
      const message = JSON.stringify({
        type: 'novo_pix',
        data: data
      });

      connectedClients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });

      console.log(`Notificação enviada para ${connectedClients.size} cliente(s)`);

      return new Response(
        JSON.stringify({ success: true, data }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      );
    } catch (error) {
      console.error('Erro no webhook:', error);
      const message = error instanceof Error ? error.message : 'Erro desconhecido';
      return new Response(
        JSON.stringify({ error: message }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500
        }
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
});
