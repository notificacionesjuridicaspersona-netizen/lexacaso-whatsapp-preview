import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const SPREADSHEET_ID = "1Mvu28JN5FnCzv7ZYkOulQHBSe3sianPYuQeQfmiVEtc";
const SHEET_RANGE = "Clientes!A:J";

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKeyRaw = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");

  if (!serviceAccountEmail || !privateKeyRaw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL o GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY no configurados.");
  }

  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signInput = `${headerB64}.${payloadB64}`;

  const pem = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryDer = atob(pem);
  const ab = new ArrayBuffer(binaryDer.length);
  const view = new Uint8Array(ab);
  for (let i = 0; i < binaryDer.length; i++) {
    view[i] = binaryDer.charCodeAt(i);
  }

  const keyData = await crypto.subtle.importKey(
    "pkcs8",
    ab,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyData, encoder.encode(signInput));
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signInput}.${signatureB64}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    throw new Error(`Error obteniendo token de Google: ${errBody}`);
  }

  const tokenData: GoogleTokenResponse = await tokenRes.json();
  return tokenData.access_token;
}

async function findRowByCedula(accessToken: string, cedula: string): Promise<number | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_RANGE}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const rows = data.values as string[][] | undefined;
  if (!rows) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][0] === cedula) {
      return i + 1;
    }
  }
  return null;
}

async function findRowByCorreo(accessToken: string, correo: string): Promise<number | null> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_RANGE}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const rows = data.values as string[][] | undefined;
  if (!rows) return null;

  for (let i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i][2] === correo) {
      return i + 1;
    }
  }
  return null;
}

async function appendRow(accessToken: string, values: (string | null)[]): Promise<void> {
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_RANGE}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    }
  );
}

async function updateRow(accessToken: string, rowNumber: number, values: (string | null)[]): Promise<void> {
  const range = `Clientes!A${rowNumber}:J${rowNumber}`;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [values] }),
    }
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    const anonClient = createClient(supabaseUrl, anonKey);
    const { data: { user }, error: userError } = await anonClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("rol")
      .eq("id", user.id)
      .single();

    if (profile?.rol !== "admin") {
      return new Response(
        JSON.stringify({ error: "Solo administradores pueden sincronizar con Google Sheets" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const action = body.action as string;

    const accessToken = await getGoogleAccessToken();

    if (action === "sync_client") {
      const { cedula, nombreCompleto, correo, telefono, numeroExpediente, areaJuridica, estado, fechaRegistro, folderId } = body;

      const rowValues = [
        cedula || "",
        nombreCompleto || "",
        correo || "",
        telefono || "",
        numeroExpediente || "",
        areaJuridica || "",
        estado || "",
        fechaRegistro || new Date().toISOString().split("T")[0],
        folderId || "",
      ];

      const existingRow = (cedula && (await findRowByCedula(accessToken, cedula)))
        || (correo && (await findRowByCorreo(accessToken, correo)));

      if (existingRow) {
        await updateRow(accessToken, existingRow, rowValues);
      } else {
        await appendRow(accessToken, rowValues);
      }

      return new Response(JSON.stringify({ success: true, action: existingRow ? "updated" : "inserted", row: existingRow }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "sync_expediente") {
      const { userId } = body;

      const { data: clientProfile } = await adminClient
        .from("profiles")
        .select("cedula, nombre_completo, email, celular")
        .eq("id", userId)
        .single();

      const { data: expedientes } = await adminClient
        .from("expedientes")
        .select("numero_expediente, area_juridica, estado, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!clientProfile) {
        return new Response(JSON.stringify({ error: "Cliente no encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const exp = (expedientes && expedientes.length > 0) ? expedientes[0] : null;

      const rowValues = [
        clientProfile.cedula || "",
        clientProfile.nombre_completo || "",
        clientProfile.email || "",
        clientProfile.celular || "",
        exp?.numero_expediente || "",
        exp?.area_juridica || "",
        exp?.estado || "",
        exp ? new Date(exp.created_at).toISOString().split("T")[0] : "",
        "",
      ];

      const existingRow = (clientProfile.cedula && (await findRowByCedula(accessToken, clientProfile.cedula)))
        || (clientProfile.email && (await findRowByCorreo(accessToken, clientProfile.email)));

      if (existingRow) {
        await updateRow(accessToken, existingRow, rowValues);
      } else {
        await appendRow(accessToken, rowValues);
      }

      return new Response(JSON.stringify({ success: true, action: existingRow ? "updated" : "inserted", row: existingRow }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Acción no reconocida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
