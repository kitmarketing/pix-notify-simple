import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DollarSign, Clock, User, Wifi, WifiOff, Loader2 } from "lucide-react";

interface PixRecebido {
  id: string;
  valor: number;
  info_pagador: string;
  horario: string;
  txid: string;
  created_at: string;
}

const Index = () => {
  const [pixList, setPixList] = useState<PixRecebido[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiStatus, setApiStatus] = useState<'idle' | 'checking' | 'connected' | 'error'>('idle');

  // Testar conexão com a API do BB
  const testApiConnection = async () => {
    setApiStatus('checking');
    try {
      const { data, error } = await supabase.functions.invoke('poll_pix_bb', {
        body: {}
      });
      
      if (error) throw error;
      
      setApiStatus('connected');
      toast.success('Conectado com a API do BB', {
        description: 'A conexão está funcionando corretamente'
      });
    } catch (error) {
      console.error('Erro ao testar conexão:', error);
      setApiStatus('error');
      toast.error('Erro na conexão com a API', {
        description: 'Verifique os logs para mais detalhes'
      });
    }
  };

  // Buscar PIX recebidos de hoje
  const fetchPix = async () => {
    try {
      // Data de hoje às 00:00:00
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      
      const { data, error } = await supabase
        .from('pix_recebidos')
        .select('*')
        .gte('created_at', hoje.toISOString())
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setPixList(data || []);
    } catch (error) {
      console.error('Erro ao buscar PIX:', error);
      toast.error('Erro ao carregar PIX recebidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPix();

    // Conectar ao Supabase Realtime para notificações em tempo real
    const channel = supabase
      .channel('pix-recebidos-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'pix_recebidos'
        },
        (payload) => {
          console.log('Novo PIX recebido via realtime:', payload);
          const novoPix = payload.new as PixRecebido;
          
          // Adiciona o novo PIX no topo da lista
          setPixList(prev => [novoPix, ...prev]);
          
          // Mostra notificação
          toast.success(
            `Novo PIX recebido! R$ ${novoPix.valor.toFixed(2)}`,
            {
              description: `De: ${novoPix.info_pagador}`,
              duration: 5000,
            }
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  const totalRecebido = pixList.reduce((sum, pix) => sum + pix.valor, 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Painel de PIX Recebidos
            </h1>
            <p className="text-muted-foreground">
              Monitoramento em tempo real dos PIX do Banco do Brasil
            </p>
          </div>
          <Button
            onClick={testApiConnection}
            disabled={apiStatus === 'checking'}
            variant={apiStatus === 'error' ? 'destructive' : apiStatus === 'connected' ? 'default' : 'outline'}
            className="gap-2"
          >
            {apiStatus === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
            {apiStatus === 'connected' && <Wifi className="h-4 w-4" />}
            {apiStatus === 'error' && <WifiOff className="h-4 w-4" />}
            {apiStatus === 'idle' && <Wifi className="h-4 w-4" />}
            {apiStatus === 'checking' ? 'Testando...' : 
             apiStatus === 'connected' ? 'Conectado' : 
             apiStatus === 'error' ? 'Erro na API' : 'Testar Conexão'}
          </Button>
        </div>

        <div className="mb-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-medium flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-success" />
                Total Recebido
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-success">
                {formatCurrency(totalRecebido)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {pixList.length} {pixList.length === 1 ? 'transação' : 'transações'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Histórico de Transações</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Carregando...
              </div>
            ) : pixList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhum PIX recebido ainda
              </div>
            ) : (
              <div className="space-y-3">
                {pixList.map((pix) => (
                  <div
                    key={pix.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">
                          {pix.info_pagador}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(pix.horario)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        TXID: {pix.txid}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-success">
                        {formatCurrency(pix.valor)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;
