// src/main.js

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("preorder-form");
  const nameInput = document.getElementById("name");
  const emailInput = document.getElementById("email");
  const bookCountInput = document.getElementById("bookCount");
  const zasilkovnaInput = document.getElementById("zasilkovna");
  const messageInput = document.getElementById("message");
  const consentInput = document.getElementById("consent");

  const calculatedAmountEl = document.getElementById("calculated-amount");
  const formErrorEl = document.getElementById("form-error");
  const resultSection = document.getElementById("result");
  const qrContainer = document.getElementById("qr-container");

  const resultAmountEl = document.getElementById("result-amount");
  const resultVsEl = document.getElementById("result-vs");
  const resultAccountEl = document.getElementById("result-account");
  const resultMsgEl = document.getElementById("result-message");

  const formIntroEl = document.getElementById("form-intro");
  const amountHelpEl = document.getElementById("amount-help");
  const submitBtn = document.getElementById("submit-btn");

  if (formIntroEl && CONFIG.FORM_INTRO_HTML) {
    formIntroEl.innerHTML = CONFIG.FORM_INTRO_HTML;
  }
  if (amountHelpEl && CONFIG.AMOUNT_HELP_TEXT) {
    amountHelpEl.innerHTML = CONFIG.AMOUNT_HELP_TEXT;
  }

  function calculateAmount() {
    const bookCountRaw = parseInt(bookCountInput.value, 10) || 0;
    const minBooks = CONFIG.MIN_BOOK_COUNT || 1;
    const count = Math.max(bookCountRaw, minBooks);

    const total = CONFIG.BOOK_PRICE * count + CONFIG.SHIPPING_FEE;

    if (calculatedAmountEl) {
      calculatedAmountEl.textContent = total.toFixed(0);
    }

    return { total, count };
  }

  bookCountInput.addEventListener("input", calculateAmount);
  calculateAmount();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const name = nameInput.value.trim();
    const email = emailInput.value.trim();
    const bookCount = parseInt(bookCountInput.value, 10) || 0;
    const zasilkovna = zasilkovnaInput.value.trim();
    const userMessage = messageInput.value.trim();

    if (!name || !email) {
      showError("Vyplň prosím jméno a e-mail.");
      return;
    }

    if (!zasilkovna) {
      showError("Prosím vlož odkaz na vybranou pobočku nebo box Zásilkovny.");
      return;
    }

    if (!consentInput.checked) {
      showError("Bez souhlasu se zpracováním osobních údajů nemůžeme pokračovat.");
      return;
    }

    // Přepočítej částku (pro jistotu)
    calculateAmount();

    submitBtn.disabled = true;
    submitBtn.textContent = "Generuji QR…";

    try {
      const response = await fetch("/.netlify/functions/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          bookCount,
          zasilkovna,
          message: userMessage,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Server vrátil chybu.");
      }

      resultAmountEl.textContent = data.amount.toFixed(0);
      resultVsEl.textContent = data.variableSymbol;
      resultAccountEl.textContent = data.accountHumanReadable || CONFIG.ACCOUNT_HUMAN;
      resultMsgEl.textContent = data.message || CONFIG.PAYMENT_MESSAGE;

      qrContainer.innerHTML = "";
      if (data.qrDataUrl) {
        const img = document.createElement("img");
        img.src = data.qrDataUrl;
        img.alt = "QR kód pro platbu";
        qrContainer.appendChild(img);
      } else if (data.qrSvg) {
        qrContainer.innerHTML = data.qrSvg;
      } else {
        qrContainer.textContent = "QR kód se nepodařilo načíst.";
      }

      resultSection.style.display = "block";
      window.scrollTo({ top: resultSection.offsetTop, behavior: "smooth" });
    } catch (err) {
      console.error(err);
      showError("Omlouváme se, ale nepodařilo se vygenerovat QR platbu. Zkus to prosím později.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Vygenerovat QR platbu";
    }
  });

  function showError(msg) {
    formErrorEl.textContent = msg;
    formErrorEl.style.display = "block";
  }

  function hideError() {
    formErrorEl.style.display = "none";
    formErrorEl.textContent = "";
  }
});
