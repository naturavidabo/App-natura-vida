// Natura Vida V8.2.7 — Asistente secretario operativo con ventas, cotizaciones y trabajos supervisados.
// Secrets: GEMINI_API_KEY. Opcionales: GEMINI_MODEL, AI_DAILY_LIMIT, AI_ALLOWED_ORIGIN.
import { createClient } from "npm:@supabase/supabase-js@2";

const allowedOrigin = Deno.env.get("AI_ALLOWED_ORIGIN") || "*";
const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.1-flash-lite";
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
    focusedAccount: s.focusedAccount && typeof s.focusedAccount === "object" ? s.focusedAccount : null,
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
  try {
    const value = JSON.parse(clean);
    if (!value || typeof value !== "object") throw new Error("empty");
    return value;
  } catch {
    const first = clean.indexOf("{");
    const last = clean.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const value = JSON.parse(clean.slice(first, last + 1));
      if (value && typeof value === "object") return value;
    }
    throw new Error("El modelo no devolvió un JSON utilizable.");
  }
}

const answerSchema = {
  type: "object", additionalProperties: false,
  properties: {
    title: { type: "string", description: "Título breve" },
    summary: { type: "string", description: "Conclusión directa y verificable" },
    facts: { type: "array", items: { type: "string" }, maxItems: 6 },
    recommendations: { type: "array", items: { type: "string" }, maxItems: 5 },
    risks: { type: "array", items: { type: "string" }, maxItems: 4 },
    next_questions: { type: "array", items: { type: "string" }, maxItems: 4 },
    confidence: { type: "string", enum: ["alta", "media", "baja"] },
    action_area: { type: "string", enum: ["none", "ventas", "clientes", "inventario", "cobranzas", "reglas-comerciales", "territorio", "finanzas", "rendicion"] },
    intent: { type: "string", enum: ["analysis", "create_payment_plan", "register_payment", "generate_receipt", "seller_settlement", "open_area", "prepare_sale", "create_quote"] },
    missing_fields: { type: "array", items: { type: "string" }, maxItems: 5 },
    draft_action: {
      type: "object", additionalProperties: false,
      properties: {
        type: { type: "string", enum: ["none", "create_payment_plan", "register_payment", "generate_receipt", "seller_settlement", "open_area", "prepare_sale", "create_quote"] },
        client_query: { type: "string" }, amount: { type: "number" }, installment_amount: { type: "number" },
        frequency: { type: "string", enum: ["", "monthly", "biweekly", "weekly"] },
        start_date: { type: "string" }, note: { type: "string" },
        payment_method: { type: "string", enum: ["", "cash", "qr", "credit"] },
        sale_type: { type: "string", enum: ["", "unit", "market", "representative_transfer", "reseller_unit", "reseller_wholesale"] },
        items: {
          type: "array", maxItems: 8,
          items: {
            type: "object", additionalProperties: false,
            properties: {
              product_query: { type: "string" },
              quantity: { type: "number" }
            },
            required: ["product_query", "quantity"]
          }
        }
      },
      required: ["type", "client_query", "amount", "installment_amount", "frequency", "start_date", "note", "payment_method", "sale_type", "items"]
    }
  },
  required: ["title", "summary", "facts", "recommendations", "risks", "next_questions", "confidence", "action_area", "intent", "missing_fields", "draft_action"]
};

async function callGemini(apiKey: string, prompt: string, structured = true) {
  const body: Record<string, unknown> = {
    model,
    input: structured ? prompt : `${prompt}\n\nDevuelve SOLO un objeto JSON válido con las claves exactas del esquema descrito. No uses bloques Markdown.`,
    store: false,
    generation_config: { thinking_level: "low", max_output_tokens: 4096 },
  };
  if (structured) body.response_format = { type: "text", mime_type: "application/json", schema: answerSchema };
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; }
  catch { return { ok: false, status: response.status || 502, message: "Gemini devolvió una respuesta no JSON.", rawPreview: text(raw, 240) }; }
  if (!response.ok) return { ok: false, status: response.status, message: text(payload?.error?.message || payload?.message || `Gemini respondió ${response.status}`, 300), payload };
  const generated = outputText(payload);
  if (!generated) return { ok: false, status: 502, message: "Gemini respondió sin contenido utilizable.", payload };
  try { return { ok: true, status: response.status, answer: parseStructured(generated), payload, fallbackFormat: !structured }; }
  catch (error) { return { ok: false, status: 502, message: text(error instanceof Error ? error.message : error, 300), rawPreview: text(generated, 300), payload }; }
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

    if (action === "health") return reply(200, { ok: true, configured: Boolean(apiKey), migrationReady, model, usage, message: !apiKey ? "Falta configurar GEMINI_API_KEY." : !migrationReady ? "Falta ejecutar la migración del motor IA." : "Motor IA disponible." });
    if (action !== "chat") return reply(400, { ok: false, code: "INVALID_ACTION", message: "Acción no reconocida." });
    if (!apiKey) return reply(503, { ok: false, code: "AI_ENGINE_NOT_CONFIGURED", message: "El motor IA todavía no tiene una clave configurada." });
    if (!migrationReady) return reply(503, { ok: false, code: "AI_MIGRATION_REQUIRED", message: "Ejecuta la migración del motor IA." });

    const question = text(body.question, 1200);
    if (question.length < 2) return reply(400, { ok: false, code: "QUESTION_REQUIRED", message: "Escribe una consulta." });
    const { data: quota, error: quotaError } = await client.rpc("nv_consume_ai_request", { p_limit: dailyLimit });
    if (quotaError) return reply(429, { ok: false, code: "AI_LIMIT_REACHED", message: quotaError.message || "Se alcanzó el límite diario." });

    const snapshot = compactSnapshot(body.snapshot);
    const history = Array.isArray(body.history) ? body.history.slice(-8).map((x: any) => ({ role: x?.role === "assistant" ? "assistant" : "user", text: text(x?.text, 700) })) : [];
    const contextLabel = text(body.context?.label || "Negocio general", 80);
    const prompt = `Eres el asistente ejecutivo privado de Natura Vida Bolivia. Responde en español claro y profesional.\n\nREGLAS:\n1. Usa solo el resumen proporcionado y no inventes cifras, clientes ni pagos.\n2. Separa hechos, sugerencias y riesgos.\n3. Puedes preparar borradores de plan de pagos, registro de pago, recibo, rendición, venta o cotización, pero nunca afirmes que los guardaste.\n4. Si el usuario pide una acción y falta cliente, monto, producto, cantidad u otro dato imprescindible, pregunta únicamente lo necesario y enumera missing_fields.\n5. Para planes: detecta cliente, monto de cuota, frecuencia y fecha inicial. Para pagos/recibos: cliente y monto pagado. Para ventas o cotizaciones: detecta producto, presentación, cantidad, cliente si fue indicado y forma de pago si corresponde.\n6. draft_action solo es una propuesta; la aplicación buscará clientes y productos reales, comprobará precio y stock y exigirá confirmación humana.\n7. Cuando el usuario pida elaborar, preparar o generar una venta, recibo con venta o cotización, utiliza intent prepare_sale o create_quote y completa draft_action.items. No te limites a explicar que debe hacerse manualmente.\n8. No sugieras descuentos que violen las reglas comerciales. Sé breve, concreta el trabajo y entrega un borrador operable.\n\nContexto: ${contextLabel}\nHistorial: ${JSON.stringify(history)}\nPregunta: ${question}\nResumen: ${JSON.stringify(snapshot)}`;

    const started = Date.now();
    let result = await callGemini(apiKey, prompt, true);
    if (!result.ok && [400, 422, 502].includes(Number(result.status))) {
      console.warn("NV_AI_STRUCTURED_RETRY", { status: result.status, message: result.message, model });
      result = await callGemini(apiKey, prompt, false);
    }
    if (!result.ok) {
      console.error("NV_AI_GEMINI_ERROR", { status: result.status, model, message: result.message, rawPreview: result.rawPreview || "" });
      return reply(Number(result.status) >= 400 && Number(result.status) < 500 ? Number(result.status) : 502, { ok: false, code: "GEMINI_UPSTREAM_ERROR", message: result.message, upstreamStatus: result.status });
    }

    const questionHash = await hashQuestion(question);
    const latencyMs = Date.now() - started;
    try {
      const { error: auditError } = await client.rpc("nv_log_ai_event", { p_engine: "gemini", p_model: model, p_status: "success", p_context: contextLabel, p_question_hash: questionHash, p_metadata: { latency_ms: latencyMs, snapshot_bytes: JSON.stringify(snapshot).length, fallback_format: Boolean(result.fallbackFormat) } });
      if (auditError) console.warn("NV_AI_AUDIT_WARNING", { message: auditError.message, code: auditError.code });
    } catch (auditError) { console.warn("NV_AI_AUDIT_WARNING", { message: auditError instanceof Error ? auditError.message : String(auditError) }); }

    return reply(200, { ok: true, engine: "gemini", model, answer: result.answer, usage: quota, retryMode: result.fallbackFormat ? "json_prompt" : "structured", privacy: { snapshotOnly: true, phonesExcluded: true, addressesExcluded: true, emailsExcluded: true, serverConversationStorage: false } });
  } catch (error) {
    const message = text(error instanceof Error ? error.message : error, 300) || "No se pudo completar la consulta.";
    console.error("Fallo no controlado en nv-ai-assistant", { message, stack: error instanceof Error ? text(error.stack, 1000) : "" });
    return reply(500, { ok: false, code: "AI_ENGINE_ERROR", message });
  }
});
