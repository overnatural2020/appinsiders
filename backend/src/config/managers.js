// Universo de gestores 13F, etiquetado por tipo:
//   - "activo"        : hedge funds de alta convicción (su señal pesa más).
//   - "institucional" : grandes gestores que dan la línea base de referencia.
//
// CADA CIK fue VERIFICADO contra EDGAR (browse-edgar + data.sec.gov/submissions),
// confirmando nombre conforme y que el filer presenta 13F-HR reciente (2025-26).
// No agregar CIK "de memoria": un CIK errado ingiere el gestor equivocado en
// silencio. Para añadir más, verifica primero el CIK del filer de 13F en EDGAR.
//
// (BlackRock se omite: no se halló un filer de 13F vigente verificable; sus
//  entidades 13F antiguas dejaron de presentar / se reestructuraron.)

export const MANAGERS = [
  // ---------------- ACTIVOS (hedge funds de alta convicción) ----------------
  { cik: "0001649339", name: "Scion Asset Management, LLC", type: "activo" },        // Michael Burry
  { cik: "0001336528", name: "Pershing Square Capital Management, L.P.", type: "activo" }, // Bill Ackman
  { cik: "0001656456", name: "Appaloosa LP", type: "activo" },                       // David Tepper
  { cik: "0001489933", name: "DME Capital Management, LP", type: "activo" },          // David Einhorn (Greenlight)
  { cik: "0001040273", name: "Third Point LLC", type: "activo" },                    // Dan Loeb
  { cik: "0001350694", name: "Bridgewater Associates, LP", type: "activo" },         // Ray Dalio
  { cik: "0001037389", name: "Renaissance Technologies LLC", type: "activo" },
  { cik: "0001423053", name: "Citadel Advisors LLC", type: "activo" },               // Ken Griffin
  { cik: "0001061768", name: "Baupost Group LLC/MA", type: "activo" },               // Seth Klarman
  { cik: "0000921669", name: "Icahn Carl C", type: "activo" },                       // Carl Icahn
  { cik: "0001167483", name: "Tiger Global Management LLC", type: "activo" },
  { cik: "0001135730", name: "Coatue Management LLC", type: "activo" },
  { cik: "0001061165", name: "Lone Pine Capital LLC", type: "activo" },
  { cik: "0001103804", name: "Viking Global Investors LP", type: "activo" },
  { cik: "0000934639", name: "Maverick Capital Ltd", type: "activo" },
  { cik: "0001179392", name: "Two Sigma Investments, LP", type: "activo" },
  { cik: "0001273087", name: "Millennium Management LLC", type: "activo" },          // Izzy Englander
  { cik: "0001167557", name: "AQR Capital Management LLC", type: "activo" },
  { cik: "0001318757", name: "Marshall Wace, LLP", type: "activo" },
  { cik: "0001791786", name: "Elliott Investment Management L.P.", type: "activo" }, // Paul Singer
  { cik: "0001029160", name: "Soros Fund Management LLC", type: "activo" },
  { cik: "0001138995", name: "Glenview Capital Management, LLC", type: "activo" },   // Larry Robbins
  { cik: "0001425851", name: "Pentwater Capital Management LP", type: "activo" },
  { cik: "0001328785", name: "Senvest Management, LLC", type: "activo" },
  { cik: "0001709323", name: "Himalaya Capital Management LLC", type: "activo" },    // Li Lu
  { cik: "0001112520", name: "Akre Capital Management LLC", type: "activo" },
  { cik: "0001418814", name: "ValueAct Holdings, L.P.", type: "activo" },            // Jeff Ubben/Mason Morfit
  { cik: "0001345471", name: "Trian Fund Management, L.P.", type: "activo" },        // Nelson Peltz
  { cik: "0001517137", name: "Starboard Value LP", type: "activo" },                // Jeff Smith
  { cik: "0001747057", name: "D1 Capital Partners L.P.", type: "activo" },          // Dan Sundheim
  { cik: "0001387322", name: "Whale Rock Capital Management LLC", type: "activo" },
  { cik: "0001541617", name: "Altimeter Capital Management, LP", type: "activo" },
  { cik: "0001569049", name: "Light Street Capital Management, LLC", type: "activo" },
  { cik: "0001535472", name: "Corvex Management LP", type: "activo" },               // Keith Meister
  { cik: "0001536411", name: "Duquesne Family Office LLC", type: "activo" },         // Stanley Druckenmiller
  { cik: "0001067983", name: "Berkshire Hathaway Inc", type: "activo" },            // Warren Buffett
  { cik: "0001034524", name: "Polen Capital Management LLC", type: "activo" },
  { cik: "0001582090", name: "Sachem Head Capital Management LP", type: "activo" },  // Scott Ferguson
  { cik: "0001353316", name: "Hound Partners, LLC", type: "activo" },
  { cik: "0001569205", name: "Fundsmith LLP", type: "activo" },                      // Terry Smith

  // ---------------- INSTITUCIONALES (línea base de referencia) ---------------
  { cik: "0000102909", name: "Vanguard Group Inc", type: "institucional" },
  { cik: "0000093751", name: "State Street Corp", type: "institucional" },
  { cik: "0000315066", name: "FMR LLC", type: "institucional" },                     // Fidelity
  { cik: "0000080255", name: "Price T Rowe Associates Inc /MD/", type: "institucional" },
  { cik: "0000902219", name: "Wellington Management Group LLP", type: "institucional" },
  { cik: "0001422849", name: "Capital World Investors", type: "institucional" },     // Capital Group
  { cik: "0001214717", name: "Geode Capital Management, LLC", type: "institucional" },
  { cik: "0001374170", name: "Norges Bank", type: "institucional" },                 // fondo soberano de Noruega
  { cik: "0000895421", name: "Morgan Stanley", type: "institucional" },
  { cik: "0000070858", name: "Bank of America Corp /DE/", type: "institucional" },
];

export const MANAGER_TYPES = ["activo", "institucional"];
