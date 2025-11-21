// poll_pix_bb.js - Consulta PIX recebidos periodicamente via proxy com mTLS

import fs from "fs";
import https from "https";
import fetch from "node-fetch";
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Caminhos dos certificados no servidor
const CERT_PATH = "/root/certificadosBB/cert.pem";
const KEY_PATH = "/root/certificadosBB/key.pem";

// Renovar token BB
async function renovarTokenBB(): Promise<string | null> {
  const BB_CLIENT_ID = process.env.BB_CLIENT_ID;
  const BB_CLIENT_SECRET = process.env.BB_CLIENT_SECRET;

  if (!BB_CLIENT_ID || !BB_CLIENT_SECRET) {
    console.error("❌ BB_CLIENT_ID ou BB_CLIENT_SECRET não configurados");
    return null;
  }

  const tokenUrl = "https://oauth.bb.com.br/oauth/token";
  const credentials = Buffer.from(`${BB_CLIENT_ID}:${BB_CLIENT_SECRET}`).toString("base64");

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

// Consultar PIX recebidos via proxy com mTLS
async function consultarPixBB(token: string): Promise<any[]> {
  const CHAVE_PIX = process.env.CHAVE_PIX;

  if (!CHAVE_PIX) {
    throw new Error("CHAVE_PIX não configurada");
  }

  const agora = new Date();
  const duasHorasAtras = new Date(agora.getTime() - 2 * 60 * 60 * 1000);

  const formatarData = (data: Date) => data.toISOString().replace(/\.\d{3}Z$/, '-03:00');

  const inicio = formatarData(duasHorasAtras);
  const fim = formatarData(agora);

  const url = `https://pix.zapinteligente.com/pix?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`;

  console.log(`📡 Consultando PIX via proxy de ${inicio} até ${fim}`);

  // Cria o agente HTTPS com mTLS
  const agent = new https.Agent({
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
    rejectUnauthorized: true, // valida o certificado do servidor
  });

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      agent,
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

// Função principal
export async function pollPixBB() {
  console.log("🔄 Iniciando polling de PIX...");

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Variáveis Supabase não configuradas");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("🔑 Renovando token do BB...");
    const token = await renovarTokenBB();

    if (!token) {
      throw new Error("Não foi possível obter token do BB");
    }

    console.log("📥 Consultando PIX via servidor proxy...");
    const pixList = await consultarPixBB(token);
    console.log(`📊 Encontrados ${pixList.length} PIX`);

    const results = [];

    for (const pix of pixList) {
      const txid = pix.txid || pix.endToEndId || crypto.randomUUID();
      const valor = parseFloat(pix.valor) || 0;
      const info_pagador = pix.pagador?.nome || "Desconhecido";
      const horario = pix.horario || new Date().toISOString();

      const { data, error } = await supabase
        .from("pix_recebidos")
        .insert([{ txid, valor, info_pagador, horario }])
        .select();

      if (error) {
        if (error.code === "23505") {
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
    return { pix_consultados: pixList.length, pix_novos: novosPixCount, pix_duplicados: duplicadosCount, results };

  } catch (err) {
    console.error("❌ Erro no polling:", err);
    throw err;
  }
}

// Rodar localmente se for o script principal
if (require.main === module) {
  pollPixBB().then(console.log).catch(console.error);
}
