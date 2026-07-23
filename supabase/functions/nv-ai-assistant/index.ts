// Natura Vida V8.2.3 — Edge Function corregida, segura y con errores diagnosticables.
// Secrets requeridos: GEMINI_API_KEY. Opcionales: GEMINI_MODEL, AI_DAILY_LIMIT, AI_ALLOWED_ORIGIN.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("AI_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash-lite";
const dailyLimit = Math.max(1, Math.min(200, Number(Deno.env.get("AI_DAILY_LIMIT") || 30)));

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}
function text(value: unknown, max = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
function isCentralAdmin(profile: Record<string, unknown> | null) {
  return profile?.commercial_role === "central_admin" && String(profile?.status || "activo").toLowerCase() !== "bloqueado";
}
function compactSnapshot(source: unknown) {
  if (!source || typeof source !== "object") return {};
  const s = source as Record<string, unknown>;
  const compact = {
    generatedAt: text(s.generatedAt, 40),
    context: s.context || {}, privacy: s.privacy || {}, metrics: s.metrics || {}, commercialRules: s.commercialRules || {},
    topProducts: Array.isArray(s.topProducts) ? s.topProducts.slice(0, 12) : [],
    criticalStock: Array.isArray(s.criticalStock) ? s.criticalStock.slice(0, 12) : [],
    customersForFollowUp: Array.isArray(s.customersForFollowUp) ? s.customersForFollowUp.slice(0, 14) : [],
    topReceivables: Array.isArray(s.topReceivables) ? s.topReceivables.slice(0, 14) : [],
    focusedAccount: s.focusedAccount && typeof s.focusedAccount === 'object' ? s.focusedAccount : null,
    alerts: Array.isArray(s.alerts) ? s.alerts.slice(0, 8) : [],
  };
  const serialized = JSON.stringify(compact);
  if (serialized.length > 52000) throw new Error("El resumen empresarial supera el tamaño permitido.");
  return compact;
}
async function hashQuestion(question: string) {
  const bytes = new TextEncoder().encode(question.toLowerCase().trim());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function outputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const step of payload?.steps || []) {
    if (step?.type !== "model_output") continue;
    for (const part of step?.content || []) if (part?.type === "text" && typeof part.text === "string") chunks.push(part.text);
  }
  return chunks.join("\n");
}
function parseStructured(raw: string) {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const value = JSON.parse(clean);
  if (!value || typeof value !== "object") throw new Error("El modelo devolvió una respuesta vacía.");
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply(405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Método no permitido." });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) return reply(401, { ok: false, code: "AUTH_REQUIRED", message: "Sesión requerida." });
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publishable = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    if (!supabaseUrl || !publishable) return reply(503, { ok: false, code: "SUPABASE_ENV_MISSING", message: "Falta configuración segura de Supabase." });
    const client = createClient(supabaseUrl, publishable, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData.user) return reply(401, { ok: false, code: "INVALID_SESSION", message: "La sesión no es válida." });
    const { data: profile, error: profileError } = await client.from("profiles").select("id,commercial_role,status").eq("id", userData.user.id).maybeSingle();
    if (profileError || !isCentralAdmin(profile as Record<string, unknown> | null)) return reply(403, { ok: false, code: "ADMIN_ONLY", message: "El motor IA está reservado al administrador central." });

    const raw = await req.text();
    if (raw.length > 70000) return reply(413, { ok: false, code: "PAYLOAD_TOO_LARGE", message: "La consulta contiene demasiados datos." });
    const body = raw ? JSON.parse(raw) : {};
    const action = text(body.action || "chat", 20);
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const { data: usageData, error: usageError } = await client.rpc("nv_ai_usage_status", { p_limit: dailyLimit });
    const migrationReady = !usageError;
    const usage = migrationReady ? usageData : { used: 0, limit: dailyLimit, remaining: dailyLimit };

    if (action === "health") {
      return reply(200, { ok: true, configured: Boolean(apiKey), migrationReady, model, usage, message: !apiKey ? "Falta configurar GEMINI_API_KEY." : !migrationReady ? "Falta ejecutar la migración del motor IA." : "Motor IA disponible." });
    }
    if (action !== "chat") return reply(400, { ok: false, code: "INVALID_ACTION", message: "Acción no reconocida." });
    if (!apiKey) return reply(503, { ok: false, code: "AI_ENGINE_NOT_CONFIGURED", message: "El motor IA todavía no tiene una clave configurada." });
    if (!migrationReady) return reply(503, { ok: false, code: "AI_MIGRATION_REQUIRED", message: "Ejecuta la migración del motor IA antes de habilitar consultas externas." });

    const question = text(body.question, 1200);
    if (question.length < 2) return reply(400, { ok: false, code: "QUESTION_REQUIRED", message: "Escribe una consulta." });
    const { data: quota, error: quotaError } = await client.rpc("nv_consume_ai_request", { p_limit: dailyLimit });
    if (quotaError) return reply(429, { ok: false, code: "AI_LIMIT_REACHED", message: quotaError.message || "Se alcanzó el límite diario." });

    const snapshot = compactSnapshot(body.snapshot);
    const history = Array.isArray(body.history) ? body.history.slice(-8).map((x: any) => ({ role: x?.role === "assistant" ? "assistant" : "user", text: text(x?.text, 700) })) : [];
    const contextLabel = text(body.context?.label || "Negocio general", 80);
    const prompt = `Eres el analista comercial privado de Natura Vida Bolivia. Responde en español claro y profesional.\n\nREGLAS OBLIGATORIAS:\n1. Usa solamente el resumen empresarial proporcionado; no inventes cifras, fechas, clientes ni acciones.\n2. Los cálculos críticos del resumen son la fuente de verdad. Si falta un dato, dilo.\n3. Separa hechos comprobados de sugerencias. Toda recomendación debe explicar su motivo y riesgo.\n4. No afirmes que modificaste precios, inventario, ventas, pagos, clientes o promociones. Solo propones; la aplicación exige confirmación humana.\n5. Evita recomendaciones que violen el margen mínimo o el descuento máximo.\n6. Prioriza acciones realistas para un negocio en crecimiento.\n7. Sé breve: conclusión, datos, recomendaciones y riesgos.
8. Puedes sugerir acciones, pero solo de la lista permitida y siempre como propuesta que requiere confirmación en la aplicación.\n\nContexto visible: ${contextLabel}\nHistorial reciente: ${JSON.stringify(history)}\nPregunta: ${question}\nResumen empresarial: ${JSON.stringify(snapshot)}`;
    const schema = {
      type: "object", additionalProperties: false,
      properties: {
        title: { type: "string", description: "Título breve del análisis" },
        summary: { type: "string", description: "Conclusión directa basada en los datos" },
        facts: { type: "array", items: { type: "string" }, maxItems: 6 },
        recommendations: { type: "array", items: { type: "string" }, maxItems: 5 },
        risks: { type: "array", items: { type: "string" }, maxItems: 4 },
        next_questions: { type: "array", items: { type: "string" }, maxItems: 4 },
        confidence: { type: "string", enum: ["alta", "media", "baja"] },
        action_area: { type: "string", enum: ["none", "ventas", "clientes", "inventario", "cobranzas", "reglas-comerciales", "territorio", "finanzas"] },
        suggested_actions: { type: "array", items: { type: "string", enum: ["open_area", "prepare_followup", "prepare_collection", "simulate_discount", "create_quote"] }, maxItems: 3 },
      }, required: ["title", "summary", "facts", "recommendations", "risks", "next_questions", "confidence", "action_area", "suggested_actions"]
    };
    const started = Date.now();
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        model,
        input: prompt,
        store: false,
        generation_config: {
          thinking_level: "low",
          max_output_tokens: 4096,
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema,
        },
      }),
    });

    const aiRaw = await aiResponse.text();
    let aiPayload: any = {};
    try {
      aiPayload = aiRaw ? JSON.parse(aiRaw) : {};
    } catch {
      console.error("Gemini devolvió una respuesta no JSON", {
        status: aiResponse.status,
        bodyPreview: text(aiRaw, 240),
      });
      return reply(502, {
        ok: false,
        code: "AI_INVALID_RESPONSE",
        message: "Gemini devolvió una respuesta no válida.",
        upstreamStatus: aiResponse.status,
      });
    }

    if (!aiResponse.ok) {
      const upstreamMessage = text(
        aiPayload?.error?.message || aiPayload?.message || `Gemini respondió ${aiResponse.status}`,
        300,
      );
      console.error("Error de Gemini", {
        status: aiResponse.status,
        model,
        message: upstreamMessage,
      });
      return reply(aiResponse.status >= 400 && aiResponse.status < 500 ? aiResponse.status : 502, {
        ok: false,
        code: "GEMINI_UPSTREAM_ERROR",
        message: upstreamMessage,
        upstreamStatus: aiResponse.status,
      });
    }

    const generatedText = outputText(aiPayload);
    if (!generatedText) {
      console.error("Gemini respondió sin texto utilizable", {
        status: aiResponse.status,
        model,
        payloadKeys: Object.keys(aiPayload || {}),
      });
      return reply(502, {
        ok: false,
        code: "AI_EMPTY_RESPONSE",
        message: "Gemini respondió sin contenido utilizable.",
      });
    }

    const answer = parseStructured(generatedText);
    const questionHash = await hashQuestion(question);
    const latencyMs = Date.now() - started;
    await client.rpc("nv_log_ai_event", { p_engine: "gemini", p_model: model, p_status: "success", p_context: contextLabel, p_question_hash: questionHash, p_metadata: { latency_ms: latencyMs, snapshot_bytes: JSON.stringify(snapshot).length } }).catch(() => {});
    return reply(200, { ok: true, engine: "gemini", model, answer, usage: quota, privacy: { snapshotOnly: true, phonesExcluded: true, addressesExcluded: true, emailsExcluded: true, serverConversationStorage: false } });
  } catch (error) {
    const message = text(error instanceof Error ? error.message : error, 300) || "No se pudo completar la consulta.";
    console.error("Fallo no controlado en nv-ai-assistant", {
      message,
      stack: error instanceof Error ? text(error.stack, 1000) : "",
    });
    return reply(500, { ok: false, code: "AI_ENGINE_ERROR", message });
  }
});
