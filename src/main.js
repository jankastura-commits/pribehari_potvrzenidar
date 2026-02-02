document.addEventListener("DOMContentLoaded", () => {
  const introEl = document.getElementById("form-intro");
  if (introEl && CONFIG && CONFIG.FORM_INTRO_HTML) introEl.innerHTML = CONFIG.FORM_INTRO_HTML;

  const gdprLink = document.getElementById("gdpr-link");
  if (gdprLink && CONFIG && CONFIG.GDPR_PDF_URL) gdprLink.href = CONFIG.GDPR_PDF_URL;

  const form = document.getElementById("donation-form");
  const submitBtn = document.getElementById("submit-btn");
  const errEl = document.getElementById("form-error");

  const foFields = document.getElementById("fo-fields");
  const poFields = document.getElementById("po-fields");

  const radios = Array.from(document.querySelectorAll('input[name="donorType"]'));

  const el = (id) => document.getElementById(id);

  function showError(msg){
    errEl.textContent = msg;
    errEl.style.display = "block";
  }

  function hideError(){
    errEl.textContent = "";
    errEl.style.display = "none";
  }

  function currentType(){
    return radios.find(r => r.checked)?.value || "FO";
  }

  function applyTypeUI(type){
    if (type === "PO") {
      foFields.style.display = "none";
      poFields.style.display = "block";

      el("firstName").required = false;
      el("lastName").required = false;

      el("companyName").required = true;
      el("ico").required = true;
      el("contactPerson").required = true;
    } else {
      foFields.style.display = "block";
      poFields.style.display = "none";

      el("firstName").required = true;
      el("lastName").required = true;

      el("companyName").required = false;
      el("ico").required = false;
      el("contactPerson").required = false;
    }
  }

  // default date = today (nice UX)
  const sentDate = el("sentDate");
  if (sentDate && !sentDate.value) {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    sentDate.value = `${yyyy}-${mm}-${dd}`;
  }

  radios.forEach(r => r.addEventListener("change", () => applyTypeUI(currentType())));
  applyTypeUI(currentType());

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    // basic browser validation
    if (!form.checkValidity()){
      showError("Prosím zkontrolujte povinná pole (označená *).");
      return;
    }

    if (!el("consent").checked){
      showError("Bez souhlasu se zpracováním osobních údajů nemůžeme pokračovat.");
      return;
    }

    const donorType = currentType();

    const payload = {
      donorType,

      // FO
      firstName: (el("firstName").value || "").trim(),
      lastName: (el("lastName").value || "").trim(),

      // PO
      companyName: (el("companyName").value || "").trim(),
      ico: (el("ico").value || "").trim(),
      contactPerson: (el("contactPerson").value || "").trim(),

      // shared
      email: (el("email").value || "").trim(),
      phone: (el("phone").value || "").trim(),
      street: (el("street").value || "").trim(),
      city: (el("city").value || "").trim(),
      zip: (el("zip").value || "").trim(),
      amount: Number(el("amount").value || 0),
      sentDate: (el("sentDate").value || "").trim(),
      newsletter: !!el("newsletter").checked
    };

    submitBtn.disabled = true;
    submitBtn.textContent = "Odesílám…";

    try{
      const res = await fetch("/.netlify/functions/create-donation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success){
        throw new Error(data.message || "Server vrátil chybu.");
      }

      window.location.href = "/thanks.html";
    } catch (err){
      console.error(err);
      showError(err.message || "Nepodařilo se odeslat formulář. Zkuste to prosím později.");
    } finally{
      submitBtn.disabled = false;
      submitBtn.textContent = "Odeslat";
    }
  });
});
