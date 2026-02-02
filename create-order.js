// netlify/functions/create-order.js

const QRCode = require("qrcode");
const { google } = require("googleapis");

const BOOK_PRICE = 500;
const SHIPPING_FEE = 180;
const MIN_BOOK_COUNT = 1;

const ACCOUNT_IBAN = process.env.ACCOUNT_IBAN || "CZ3508000000006620653309";
const PAYMENT_MESSAGE =
  process.env.PAYMENT_MESSAGE || "Predobjednavka Pribehari";
const ACCOUNT_HUMAN = process.env.ACCOUNT_HUMAN || "6620653309/0800";

// Google Sheets config
const GSHEETS_SPREADSHEET_ID = process.env.GSHEETS_SPREADSHEET_ID;
const GSHEETS_SHEET_NAME = process.env.GSHEETS_SHEET_NAME || "Objednavky";
const SERVICE_ACCOUNT_JSON_BASE64 =
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method not allowed" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const name = (body.name || "").trim();
    const email = (body.email || "").trim();
    const bookCountRaw = body.bookCount;
    const extraAmountRaw = body.extraAmount;
    const zasilkovna = (body.zasilkovna || "").trim();
    const userMessage = (body.message || "").trim();

    if (!name || !email) {
      return jsonError(400, "Chybí jméno nebo e-mail.");
    }

    if (!zasilkovna) {
      return jsonError(
        400,
        "Chybí odkaz na vybranou pobočku nebo box Zásilkovny."
      );
    }

    const bookCount = Math.max(parseInt(bookCountRaw, 10) || 0, MIN_BOOK_COUNT);
    const extraAmount = Math.max(parseFloat(extraAmountRaw) || 0, 0);

    const base = BOOK_PRICE * bookCount + SHIPPING_FEE;
    const amount = base + extraAmount;

    const vs = generateVariableSymbol();

    const spayd = buildSpaydString({
      iban: ACCOUNT_IBAN,
      amount,
      currency: "CZK",
      vs,
      message: PAYMENT_MESSAGE,
    });

    const qrDataUrl = await QRCode.toDataURL(spayd, {
      errorCorrectionLevel: "M",
      type: "image/png",
      margin: 1,
      scale: 6,
    });

    // Zapsat do Google Sheetu
    if (GSHEETS_SPREADSHEET_ID && SERVICE_ACCOUNT_JSON_BASE64) {
      try {
        await appendToSheet({
          timestamp: new Date().toISOString(),
          name,
          email,
          bookCount,
          extraAmount,
          base,
          total: amount,
          vs,
          zasilkovna,
          userMessage,
        });
      } catch (sheetErr) {
        console.error("Chyba při zápisu do Google Sheetu:", sheetErr);
        // nepadáme kvůli chybě v Sheetu – QR dál funguje
      }
    } else {
      console.warn(
        "Google Sheets env variables are not set, objednávka se neukládá do tabulky."
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        amount,
        variableSymbol: vs,
        qrDataUrl,
        accountHumanReadable: ACCOUNT_HUMAN,
        message: PAYMENT_MESSAGE,
      }),
    };
  } catch (err) {
    console.error("Error in create-order:", err);
    return jsonError(500, "Interní chyba serveru.");
  }
};

function jsonError(statusCode, message) {
  return {
    statusCode,
    body: JSON.stringify({ success: false, message }),
  };
}

function generateVariableSymbol() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 999)).padStart(3, "0");
  return `${yy}${mm}${dd}${rand}`;
}

function buildSpaydString({ iban, amount, currency, vs, message }) {
  const am = amount.toFixed(2);
  const cleanMsg = removeDiacritics(message).slice(0, 60);

  let spayd = `SPD*1.0`;
  spayd += `*ACC:${iban}`;
  spayd += `*AM:${am}`;
  spayd += `*CC:${currency}`;
  if (vs) spayd += `*X-VS:${vs}`;
  if (cleanMsg) spayd += `*MSG:${cleanMsg}`;

  return spayd;
}

function removeDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s_\-\.:]/g, "");
}

async function appendToSheet(row) {
  const decodedJson = Buffer.from(
    SERVICE_ACCOUNT_JSON_BASE64,
    "base64"
  ).toString("utf8");
  const serviceAccount = JSON.parse(decodedJson);

  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const jwt = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key.replace(/\\n/g, "\n"),
    scopes
  );

  const sheets = google.sheets({ version: "v4", auth: jwt });

  const values = [
    [
      row.timestamp,
      row.name,
      row.email,
      row.bookCount,
      row.extraAmount,
      row.base,
      row.total,
      row.vs,
      row.zasilkovna,
      row.userMessage,
    ],
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: GSHEETS_SPREADSHEET_ID,
    range: `${GSHEETS_SHEET_NAME}!A:J`,
    valueInputOption: "USER_ENTERED",
    requestBody: { values },
  });
}
