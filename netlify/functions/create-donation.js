// netlify/functions/create-donation.js
const { google } = require("googleapis");

// Google Sheets config - stejné env jako u předobjednávek
const GSHEETS_SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID;
const GSHEETS_SHEET_NAME = process.env.GSHEETS_SHEET_NAME || "Dary";
const SERVICE_ACCOUNT_JSON_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");

    const donorType = (body.donorType || "FO").trim(); // FO | PO

    // společné
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

    // Validace – minimum pro potvrzení
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

    // zapis do sheetu
    if (GSHEETS_SPREADSHEET_ID && SERVICE_ACCOUNT_JSON_BASE64) {
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
        newsletter,
      });
    } else {
      console.warn("Google Sheets env variables nejsou nastavené – data se neuloží.");
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

  // Sloupce A:O (15)
  const values = [[
    row.timestamp,
    row.donorType,
    row.firstName,
    row.lastName,
    row.companyName,
    row.ico,
    row.contactPerson,
    row.email,
    row.phone,
    row.street,
    row.city,
    row.zip,
    row.amount,
    row.sentDate,
    row.newsletter,
  ]];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: `${GSHEETS_SHEET_NAME}!A:O`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}
