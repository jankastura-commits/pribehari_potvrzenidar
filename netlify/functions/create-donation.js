const { google } = require("googleapis");
const { Resend } = require("resend");

const GSHEETS_SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID;
const GSHEETS_SHEET_NAME = process.env.GSHEETS_SHEET_NAME || "Dary";
const SERVICE_ACCOUNT_JSON_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM; // např. "Příběháři <info@pribehari.cz>"
const DONATION_BCC = process.env.DONATION_BCC || "jan.kastura@gmail.com,kasturova@gmail.com";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const donorType = (body.donorType || "FO").trim(); // FO | PO

    // shared
    const email = (body.email || "").trim();
    const phone = (body.phone || "").trim();
    const street = (body.street || "").trim();
    const city = (body.city || "").trim();
    const zip = (body.zip || "").trim();
    const amount = Number(body.amount || 0);
    const sentDate = (body.sentDate || "").trim();
    const newsletter = body.newsletter ? "ANO" : "NE";

    // FO
    const firstName = (body.firstName || "").trim();
    const lastName = (body.lastName || "").trim();

    // PO
    const companyName = (body.companyName || "").trim();
    const ico = (body.ico || "").trim();
    const contactPerson = (body.contactPerson || "").trim();

    // minimal validation
    if (!email) return jsonError(400, "Chybí e-mail.");
    if (!street || !city || !zip) return jsonError(400, "Chybí adresa (ulice, město, PSČ).");
    if (!Number.isFinite(amount) || amount <= 0) return jsonError(400, "Chybí nebo je neplatná částka daru.");
    if (!sentDate) return jsonError(400, "Chybí datum odeslání daru.");

    if (donorType === "PO") {
      if (!companyName) return jsonError(400, "Chybí název společnosti.");
      if (!ico) return jsonError(400, "Chybí IČO.");
      if (!contactPerson) return jsonError(400, "Chybí kontaktní osoba.");
    } else {
      if (!firstName || !lastName) return jsonError(400, "Chybí jméno a příjmení.");
    }

    if (!GSHEETS_SPREADSHEET_ID || !SERVICE_ACCOUNT_JSON_BASE64) {
      console.warn("Missing Google Sheets env vars. Data will not be saved.");
      return jsonError(500, "Chybí nastavení ukládání (Google Sheets).");
    }

    // 1) uložit do Google Sheets
    await appendToSheet({
      timestamp: new Date().toISOString(),
      donorType,
      firstName,
      lastName,
      companyName,
      ico,
      contactPerson,
      email,
      phone,
      street,
      city,
      zip,
      amount,
      sentDate,
      newsletter
    });

    // 2) poslat e-mail jako potvrzení přijetí žádosti (ne potvrzení platby)
    //    E-mail je "best effort" – když selže, funkce pořád vrátí success.
    try {
      await sendDonationRequestEmail({
        donorType,
        firstName,
        lastName,
        companyName,
        email,
        amount,
        sentDate,
      });
    } catch (mailErr) {
      console.error("Email send failed:", mailErr);
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    console.error("Error in create-donation:", err);
    return jsonError(500, "Interní chyba serveru.");
  }
};

function jsonError(statusCode, message) {
  return { statusCode, body: JSON.stringify({ success: false, message }) };
}

async function appendToSheet(row) {
  const decodedJson = Buffer.from(SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8");
  const serviceAccount = JSON.parse(decodedJson);

  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const jwt = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key.replace(/\\n/g, "\n"),
    scopes
  );

  const sheets = google.sheets({ version: "v4", auth: jwt });

  const values = [[
    row.timestamp,        // A
    row.donorType,        // B
    row.firstName,        // C
    row.lastName,         // D
    row.companyName,      // E
    row.ico,              // F
    row.contactPerson,    // G
    row.email,            // H
    row.phone,            // I
    row.street,           // J
    row.city,             // K
    row.zip,              // L
    row.amount,           // M
    row.sentDate,         // N
    row.newsletter        // O
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: `${GSHEETS_SHEET_NAME}!A:O`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values }
  });
}

function safeBccList() {
  return DONATION_BCC
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function formatDonorName(donorType, firstName, lastName, companyName) {
  if (donorType === "PO") return companyName || "dárce";
  const full = `${firstName || ""} ${lastName || ""}`.trim();
  return full || "dárce";
}

async function sendDonationRequestEmail({ donorType, firstName, lastName, companyName, email, amount, sentDate }) {
  // Pokud není nakonfigurovaný Resend, jen přeskočíme (nechceme rozbít flow).
  if (!resend) {
    console.warn("RESEND_API_KEY není nastaven. E-mail se neodeslal.");
    return;
  }
  if (!EMAIL_FROM) {
    console.warn("EMAIL_FROM není nastaven. E-mail se neodeslal.");
    return;
  }

  const donorName = formatDonorName(donorType, firstName, lastName, companyName);

  const subject = "Příběháři – přijali jsme žádost o potvrzení daru 💛";

  const html = `
    <p>Dobrý den, ${escapeHtml(donorName)},</p>

    <p>
      děkujeme, že podporujete projekt <strong>Příběháři</strong>.
      Vaši žádost o vystavení potvrzení o daru jsme úspěšně přijali.
    </p>

    <p>
      <strong>Rekapitulace údajů z formuláře:</strong><br/>
      Částka daru: <strong>${escapeHtml(String(amount))} Kč</strong><br/>
      Datum odeslání daru: ${escapeHtml(sentDate)}
    </p>

    <p>
      Potvrzení o daru vystavíme po spárování platby na našem transparentním účtu
      a zašleme vám jej e-mailem.
    </p>

    <p>
      Pokud jste udělali překlep v údajích, odpovězte prosím na tento e-mail.
    </p>

    <p>
      💛<br/>
      Tým Příběháři
    </p>
  `;

  await resend.emails.send({
    from: EMAIL_FROM,
    to: email,
    bcc: safeBccList(),
    subject,
    html,
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
