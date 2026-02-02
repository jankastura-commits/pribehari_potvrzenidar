// src/config.js

const CONFIG = {
  BOOK_PRICE: 500,        // cena za 1 knihu v Kč
  SHIPPING_FEE: 180,      // poštovné + balné za objednávku (jednorázové)
  MIN_BOOK_COUNT: 1,

  ACCOUNT_IBAN: "CZ0608000000006620649369",
  ACCOUNT_HUMAN: "6620649369/0800",
  PAYMENT_MESSAGE: "Predobjednavka Pribehari",

  FORM_INTRO_HTML: `
    <p>
      Tady si můžeš <strong>předobjednat knihu Příběháři</strong>.
      Základní cena je 500 Kč za kus + 180 Kč poštovné a balné za celou zásilku.
    </p>
  `,

  // Dřív tu byl text k „dobrovolnému příspěvku navíc“. Teď už ne.
  AMOUNT_HELP_TEXT: "",
};
