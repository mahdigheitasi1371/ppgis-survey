// ============================================================================
// Hochwasserrisiko & Grünflächen — PPGIS Umfrage / Flood Risk & Green Space Survey
// ============================================================================

const API = (() => {
  const placeholder = '__PORT_8000__';
  return placeholder.startsWith('__') ? 'http://localhost:8000' : placeholder;
})();

// Location choices — each has a Leaflet center/zoom near where the Emscher
// river is actually visible. Bochum's own city area is not touched by the
// Emscher itself (only tributary streams feed into it further north), so its
// view is shifted slightly toward Gerthe/Hiltrop where the real river comes
// into view near the city boundary.
const LOCATIONS = {
  dortmund: { lat: 51.4903, lng: 7.4686, zoom: 13 },
  bochum: { lat: 51.5240, lng: 7.2220, zoom: 12, riverOutsideCity: true },
  essen: { lat: 51.5130, lng: 7.0021, zoom: 13 },
};

// Real Emscher river geometry (OpenStreetMap contributors), simplified —
// drawn bold on every map so respondents can orient themselves relative to
// the river.
const EMSCHER_SEGMENTS = [[[51.574083,7.371995],[51.574282,7.370794],[51.574736,7.369668],[51.577983,7.364532],[51.57878,7.362482],[51.580181,7.360046],[51.580435,7.359915],[51.580791,7.360017],[51.581524,7.358931],[51.581745,7.358208],[51.582305,7.357687],[51.582794,7.356325],[51.583301,7.356286],[51.583586,7.355702],[51.584503,7.354761],[51.585078,7.354531],[51.588022,7.350899],[51.593608,7.342652],[51.594571,7.333442],[51.596973,7.3036],[51.596897,7.302107],[51.596343,7.300643],[51.596329,7.299429]],[[51.498244,6.929222],[51.497743,6.928037],[51.496352,6.917789],[51.49546,6.903893],[51.495811,6.885611],[51.494986,6.848626]],[[51.557553,7.415417],[51.557882,7.415418],[51.560437,7.414054],[51.560803,7.413409],[51.561366,7.413186],[51.561757,7.412822],[51.562515,7.412899],[51.563919,7.412135],[51.564565,7.411697],[51.56557,7.41059],[51.567281,7.406935],[51.570057,7.40175],[51.571777,7.398888],[51.574522,7.392957],[51.576043,7.387716],[51.576586,7.384152],[51.576664,7.382354],[51.576236,7.379893],[51.574253,7.374141],[51.574083,7.371995]],[[51.493162,7.484203],[51.492402,7.482465],[51.491737,7.481579],[51.491213,7.48016],[51.491472,7.477444],[51.491315,7.477053]],[[51.49007,7.46792],[51.489283,7.465985]],[[51.489283,7.465985],[51.487596,7.461634],[51.486591,7.46004]],[[51.491315,7.477053],[51.491049,7.476962]],[[51.491049,7.476962],[51.490802,7.476727],[51.490742,7.475931],[51.49013,7.47448],[51.490008,7.471568],[51.490095,7.470923],[51.490512,7.469875],[51.49007,7.46792]],[[51.491798,7.440016],[51.492052,7.438905]],[[51.493966,7.554603],[51.496301,7.552469],[51.497073,7.550061],[51.497127,7.547958],[51.496669,7.546811],[51.496602,7.54603],[51.496003,7.543882],[51.495963,7.542214],[51.495637,7.541962],[51.495588,7.540927],[51.495292,7.540119],[51.495209,7.539328],[51.493753,7.537031],[51.491186,7.535887],[51.490601,7.535283],[51.490464,7.534757],[51.490015,7.534226],[51.48978,7.533622],[51.489438,7.532063],[51.489091,7.531657],[51.488506,7.530328],[51.487602,7.529356],[51.487072,7.527167]],[[51.491419,7.494704],[51.491472,7.492649],[51.491147,7.489953],[51.492124,7.487018],[51.493229,7.485896],[51.493403,7.484786],[51.493162,7.484203]],[[51.492052,7.438905],[51.492172,7.438632],[51.4927,7.438342],[51.494811,7.438801],[51.495173,7.438684],[51.496215,7.437364],[51.496708,7.435919],[51.497538,7.434813]],[[51.497538,7.434813],[51.498094,7.434354]],[[51.498094,7.434354],[51.498292,7.433964]],[[51.498292,7.433964],[51.49852,7.433237]],[[51.49852,7.433237],[51.49893,7.43244],[51.499906,7.432327],[51.50037,7.43182],[51.501568,7.431126],[51.502406,7.42914],[51.50311,7.428248],[51.504202,7.4278],[51.507064,7.426151],[51.50828,7.425652],[51.508539,7.425733]],[[51.486744,7.4556],[51.486763,7.45553]],[[51.486591,7.46004],[51.486388,7.459627]],[[51.486388,7.459627],[51.486182,7.458486],[51.486744,7.4556]],[[51.486763,7.45553],[51.487779,7.453081],[51.488054,7.451661],[51.488219,7.448249],[51.490254,7.446019],[51.49056,7.445495],[51.491022,7.444401],[51.49125,7.442145],[51.491798,7.440016]],[[51.509125,7.426057],[51.509726,7.426221]],[[51.508989,7.425986],[51.509125,7.426057]],[[51.508539,7.425733],[51.508989,7.425986]],[[51.509726,7.426221],[51.510955,7.426642],[51.515277,7.428676],[51.51599,7.428698],[51.519768,7.427125],[51.526271,7.424112],[51.527557,7.423299],[51.529134,7.421811],[51.530783,7.421383]],[[51.487072,7.527167],[51.486572,7.525494],[51.486474,7.524143],[51.486944,7.521723],[51.487081,7.521627],[51.487331,7.521773],[51.487917,7.521409],[51.488494,7.518971],[51.488791,7.518294],[51.491081,7.517154],[51.491531,7.51657],[51.491587,7.511808],[51.49188,7.510329],[51.491861,7.509194],[51.492759,7.507913],[51.492778,7.505497],[51.493477,7.503755],[51.493576,7.501888]],[[51.491375,7.495881],[51.491419,7.494704]],[[51.493604,7.501192],[51.493372,7.499735],[51.492813,7.498555]],[[51.493576,7.501888],[51.493604,7.501192]],[[51.492706,7.498381],[51.492059,7.498007],[51.491542,7.496794],[51.491375,7.495881]],[[51.492813,7.498555],[51.492706,7.498381]],[[51.545163,7.084968],[51.543627,7.079995],[51.52513,7.036377],[51.515307,7.012137],[51.513035,7.002056],[51.512905,6.989787],[51.512258,6.985964]],[[51.530783,7.421383],[51.531696,7.421626],[51.532492,7.422589],[51.533326,7.424777],[51.533744,7.425376],[51.53427,7.425701],[51.534941,7.425724],[51.540491,7.42331],[51.546171,7.421313],[51.553216,7.4191],[51.554011,7.419703],[51.554364,7.419716],[51.55461,7.419028],[51.554343,7.417885],[51.554501,7.417056],[51.554936,7.41673],[51.555162,7.416788],[51.55541,7.417864],[51.555733,7.418027],[51.556605,7.415433],[51.556948,7.415308],[51.557553,7.415417]],[[51.596483,7.298083],[51.596526,7.296484],[51.596136,7.295448],[51.595089,7.294608],[51.594114,7.293372],[51.593956,7.292662],[51.593592,7.292582],[51.593379,7.292092],[51.592951,7.292157],[51.592507,7.291764],[51.592662,7.291195],[51.592282,7.291152],[51.592152,7.290708],[51.591831,7.290499],[51.591565,7.289565],[51.590687,7.288321],[51.587615,7.285069],[51.586783,7.283584],[51.581624,7.266497],[51.581705,7.264199],[51.582616,7.261654],[51.582889,7.259971],[51.582767,7.258103],[51.582297,7.256593],[51.581277,7.255156],[51.577318,7.252687],[51.576367,7.251548],[51.575798,7.250145],[51.575042,7.247293],[51.573434,7.242987],[51.572333,7.238764],[51.571559,7.23659],[51.570318,7.234406],[51.567391,7.230955],[51.566274,7.229374],[51.565324,7.227694],[51.564037,7.224668],[51.563047,7.221297],[51.559996,7.205199],[51.557199,7.19801],[51.553258,7.182449],[51.551631,7.173407],[51.550748,7.163561],[51.55082,7.154296],[51.551382,7.144971],[51.550866,7.137998],[51.550877,7.129182],[51.54853,7.106506],[51.545956,7.089296],[51.545163,7.084968]],[[51.596329,7.299429],[51.596465,7.29821]],[[51.596465,7.29821],[51.596483,7.298083]]];

const MAX_POINTS = 10;

const state = {
  step: 0,
  lang: 'de',
  consentChecked: false,
  data: {
    location: null,  // 'dortmund' | 'bochum' | 'essen'
    q1: [],  // {lat, lng, severity}
    q2: [],  // {lat, lng}
    q3: [],  // {lat, lng, helps, source}
    q4: [],  // {lat, lng}
    q5: null,
    q6: ['flood_absorption', 'recreation', 'wellbeing', 'biodiversity', 'cooling', 'aesthetic'],
    q7_exposed: null,
    q7_description: '',
    q7_audio_filename: null,
    q8: '',
    q9_age_group: null,
    q9_gender: null,
    q9_education: null,
    q10_postal_code: '',
    q10_years_at_address: null,
    q10_distance_green: null,
    q10_distance_water: null,
  },
  audio: { recording: false, mediaRecorder: null, chunks: [], blobUrl: null, uploading: false, uploadError: null },
  submitting: false,
  submitError: null,
};

// ----------------------------------------------------------------------------
// Icons
// ----------------------------------------------------------------------------
const ICONS = {
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>`,
  map: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12l5 5L19 7"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0M12 18v3"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1.5"/></svg>`,
};

// ----------------------------------------------------------------------------
// Option definitions (code + bilingual labels)
// ----------------------------------------------------------------------------
const OPTION_DEFS = {
  severity: {
    codes: [1, 2, 3, 4, 5],
    labels: {
      de: ['Sehr gering', 'Gering', 'Mittel', 'Hoch', 'Sehr hoch'],
      en: ['Very low', 'Low', 'Medium', 'High', 'Very high'],
    },
  },
  helps: {
    codes: ['yes', 'no', 'unsure'],
    labels: {
      de: ['Ja', 'Nein', 'Nicht sicher'],
      en: ['Yes', 'No', 'Not sure'],
    },
  },
  age_group: {
    codes: ['u18', '18_29', '30_44', '45_59', '60p'],
    labels: {
      de: ['unter 18', '18–29', '30–44', '45–59', '60+'],
      en: ['under 18', '18–29', '30–44', '45–59', '60+'],
    },
  },
  gender: {
    codes: ['female', 'male', 'non_binary', 'prefer_not'],
    labels: {
      de: ['Weiblich', 'Männlich', 'Nicht-binär', 'Keine Angabe'],
      en: ['Female', 'Male', 'Non-binary', 'Prefer not to say'],
    },
  },
  education: {
    codes: ['none_basic', 'secondary', 'vocational', 'bachelor', 'master_plus', 'other'],
    labels: {
      de: ['Kein/grundlegender Abschluss', 'Sekundarabschluss (z. B. Abitur)', 'Berufsausbildung', 'Bachelor', 'Master / Promotion', 'Andere'],
      en: ['No / basic qualification', 'Secondary school (e.g. Abitur)', 'Vocational training', 'Bachelor’s degree', 'Master’s / doctorate', 'Other'],
    },
  },
  years_at_address: {
    codes: ['lt1', '1_5', '5_10', 'gt10'],
    labels: {
      de: ['weniger als 1 Jahr', '1–5 Jahre', '5–10 Jahre', 'mehr als 10 Jahre'],
      en: ['less than 1 year', '1–5 years', '5–10 years', 'more than 10 years'],
    },
  },
  distance_band: {
    codes: ['lt100', '100_500', '500_1000', 'gt1000'],
    labels: {
      de: ['weniger als 100 m', '100–500 m', '500 m–1 km', 'mehr als 1 km'],
      en: ['less than 100 m', '100–500 m', '500 m–1 km', 'more than 1 km'],
    },
  },
};

const RANK_ITEMS = {
  flood_absorption: { de: 'Hochwasser- / Regenwasserrückhalt', en: 'Flood / stormwater absorption' },
  recreation: { de: 'Erholung und Entspannung', en: 'Recreation and relaxation' },
  wellbeing: { de: 'Mentales / körperliches Wohlbefinden', en: 'Mental / physical well-being' },
  biodiversity: { de: 'Biodiversität / Lebensraum für Tiere', en: 'Biodiversity / wildlife habitat' },
  cooling: { de: 'Temperaturregulierung / Abkühlung', en: 'Temperature cooling' },
  aesthetic: { de: 'Ästhetischer / landschaftlicher Wert', en: 'Aesthetic / scenic value' },
};

// ----------------------------------------------------------------------------
// Translations
// ----------------------------------------------------------------------------
const TRANSLATIONS = {
  de: {
    pageTitle: 'LiFRES — Hochwasserrisiko & Grünflächen — Umfrage',
    brand: 'LiFRES',
    brandTagline: 'Eine räumliche Perspektive aus Deutschland',
    themeToggleLabel: 'Farbschema wechseln',
    langToggleLabel: 'Sprache wechseln',
    back: '← Zurück',
    next: 'Weiter →',
    questionOf: (n) => `Frage ${n} von 10`,
    consent: {
      title: 'Hochwasserrisiko & Zugang zur Natur',
      desc: 'Diese Umfrage untersucht, wie Anwohnerinnen und Anwohner Hochwasserrisiken und Grün-/Blauflächen in ihrem Wohnviertel wahrnehmen. Ihre Angaben helfen, den Zugang zur Natur und den Hochwasserschutz besser zu planen.',
      item1: '<strong>Dauer:</strong> ca. 8–12 Minuten',
      item2: '<strong>Karte:</strong> Sie können bis zu 10 Orte pro Kartenfrage markieren',
      item3: '<strong>Anonym:</strong> Ihre Angaben werden ohne Namen ausgewertet',
      privacyTitle: 'Datenschutz & Einwilligung',
      privacyText: 'Die Teilnahme an dieser Studie ist freiwillig und erfolgt vollständig anonym. Es werden keine Namen, E-Mail-Adressen oder andere direkt identifizierenden Angaben erhoben. Die erhobenen Orts- und Antwortdaten werden ausschließlich zu wissenschaftlichen Zwecken im Rahmen dieses Forschungsprojekts ausgewertet und gemäß den Grundsätzen der Datenschutz-Grundverordnung (DSGVO) verarbeitet. Die Studie wurde im Einklang mit den Richtlinien der zuständigen Ethikkommission konzipiert. Sie können die Teilnahme jederzeit ohne Angabe von Gründen abbrechen; bereits übermittelte anonyme Daten können danach jedoch nicht mehr eindeutig zugeordnet und entfernt werden. Mit dem Absenden der Umfrage erklären Sie sich mit der Verarbeitung Ihrer anonymen Angaben zu den genannten Zwecken einverstanden.',
      privacyNote: 'Hinweis: Der endgültige, von der Ethikkommission freigegebene Wortlaut wird hier eingefügt, sobald er vorliegt.',
      consentLabel: 'Ich habe die obigen Informationen gelesen und erkläre mich freiwillig mit der anonymen Teilnahme an dieser Studie einverstanden.',
      langLabel: 'Sprache wählen',
      start: 'Umfrage starten →',
      needConsent: 'Bitte bestätigen Sie die Einwilligung, um fortzufahren.',
      partner: 'Eine Umfrage in Zusammenarbeit mit der',
    },
    location: {
      title: 'Ihr Stadtgebiet',
      desc: 'Bitte wählen Sie das Stadtgebiet aus, auf das sich Ihre Antworten beziehen sollen. Die Karten in den folgenden Fragen zeigen dann jeweils Ihre Stadt.',
      dortmund: 'Dortmund',
      bochum: 'Bochum',
      essen: 'Essen',
      bochumNote: 'Hinweis: Die Emscher selbst verläuft nicht durch das Bochumer Stadtgebiet — sie ist auf der Karte an der nächstgelegenen Stelle nördlich der Stadtgrenze markiert.',
      needSelection: 'Bitte wählen Sie ein Stadtgebiet, um fortzufahren.',
    },
    q1: {
      title: 'Hochwasserrisiko in Ihrem Viertel',
      desc: 'Markieren Sie auf der Karte den/die Bereich(e) in Ihrem Wohnviertel oder auf Ihren täglichen Wegen, die Sie als besonders hochwassergefährdet einschätzen.',
      hint: 'Tippen Sie auf die Karte, um einen Ort zu markieren',
      popupTitle: 'Wie hoch schätzen Sie das Hochwasserrisiko an diesem Ort ein?',
    },
    q2: {
      title: 'Grün- und Blauflächen, die Sie nutzen',
      desc: 'Markieren Sie die Grün- oder Blauflächen (Parks, Gärten, Flussufer, grüne Korridore usw.), die Sie regelmäßig besuchen oder die Ihnen wichtig sind.',
      hint: 'Ort(e) markieren',
    },
    q3: {
      title: 'Flächen, die vor Hochwasser schützen',
      desc: 'Welche dieser oder anderer Grün-/Blauflächen tragen Ihrer Meinung nach dazu bei, Hochwasser zu reduzieren oder Regenwasser aufzunehmen? Sie können vorhandene Orte aus Frage 2 auswählen (helle Marker) oder neue Orte markieren.',
      hint: 'Vorhandenen Ort auswählen oder neuen Ort markieren',
      popupTitle: 'Trägt dieser Ort dazu bei, Hochwasser zu reduzieren oder Regenwasser aufzunehmen?',
    },
    q4: {
      title: 'Sichere Erholungsflächen am Wasser',
      desc: 'Markieren Sie Bereiche in der Nähe von Flüssen, Bächen oder Rückhaltebecken, die Sie auch bei starkem Regen als sicher für die Erholung einschätzen.',
      hint: 'Ort(e) markieren',
    },
    q5: {
      title: 'Sorge vor Hochwasser',
      desc: 'Wie besorgt sind Sie darüber, dass Hochwasser in den nächsten 10 Jahren Ihr Zuhause oder Ihr Viertel beeinträchtigen könnte?',
      low: 'Gar nicht besorgt', high: 'Äußerst besorgt',
    },
    q6: {
      title: 'Nutzen von Grün- und Blauflächen',
      desc: 'Bitte ordnen Sie die folgenden Vorteile von Grün-/Blauflächen in Ihrem Viertel nach ihrer Wichtigkeit für Sie — von am wichtigsten (1) bis am wenigsten wichtig (6).',
    },
    q7: {
      title: 'Frühere Hochwassererfahrungen',
      desc: 'Waren Sie oder Ihr Haushalt schon einmal direkt von einem Hochwasser betroffen (z. B. Überflutung von Haus, Keller oder Garten)?',
      yes: 'Ja', no: 'Nein',
      descLabel: 'Bitte beschreiben Sie kurz, was passiert ist und wo.',
      placeholder: 'Was ist passiert, wann und wo …',
      orAudio: 'oder als Sprachaufnahme',
      recordStart: 'Aufnahme starten',
      recordStop: 'Aufnahme beenden',
      recordHint: 'Ihre Aufnahme wird gespeichert und später von unserem Team angehört.',
      recordUploading: 'Aufnahme wird gespeichert …',
      recordSaved: 'Aufnahme gespeichert.',
      recordError: 'Die Aufnahme konnte nicht gespeichert werden. Bitte versuchen Sie es erneut oder nutzen Sie das Textfeld.',
      removeAudio: 'Aufnahme entfernen',
      micUnavailable: 'Mikrofon nicht verfügbar in diesem Browser. Bitte nutzen Sie das Textfeld.',
    },
    q8: {
      title: 'Gewünschte Maßnahmen',
      desc: 'Welche Maßnahmen würden Ihrer Meinung nach am meisten helfen, das Hochwasserrisiko zu verringern und den Zugang zur Natur in Ihrer Wohngegend zu verbessern?',
      placeholder: 'Ihre Vorschläge …',
    },
    q9: {
      title: 'Angaben zu Ihrer Person',
      ageLabel: 'Altersgruppe',
      genderLabel: 'Geschlecht',
      educationLabel: 'Höchster Bildungsabschluss',
    },
    q10: {
      title: 'Wohnort & Exposition',
      postalLabel: 'Postleitzahl oder Stadtteil',
      postalPlaceholder: 'z. B. 44787',
      yearsLabel: 'Wohndauer an aktueller Adresse',
      distanceGreenLabel: 'Ungefähre Entfernung zur nächsten Grünfläche',
      distanceWaterLabel: 'Ungefähre Entfernung zum nächsten Gewässer',
    },
    review: {
      kicker: 'Fast geschafft',
      title: 'Übersicht',
      desc: 'Bitte überprüfen Sie Ihre Angaben, bevor Sie absenden.',
      labels: {
        location: 'Ausgewähltes Stadtgebiet',
        q1: 'Hochwasserrisiko-Orte', q2: 'Grün-/Blauflächen', q3: 'Hochwasserschutz-Flächen',
        q4: 'Sichere Erholungsflächen', q5: 'Sorge vor Hochwasser', q6: 'Rangfolge Nutzen',
        q7: 'Frühere Betroffenheit', q8: 'Gewünschte Maßnahmen', q9: 'Persönliche Angaben', q10: 'Wohnort & Exposition',
      },
      yes: 'Ja', no: 'Nein', notSet: '—',
      submit: 'Absenden ✓',
      sending: 'Wird gesendet …',
    },
    done: {
      title: 'Vielen Dank!',
      desc: 'Ihre Angaben wurden erfolgreich übermittelt und helfen dabei, Hochwasserschutz und Zugang zur Natur in unserem Viertel besser zu verstehen.',
      again: 'Weitere Antwort abgeben',
    },
    placesMarked: (n) => n === 0 ? 'kein Ort markiert' : `${n} Ort${n === 1 ? '' : 'e'} markiert`,
    mapMarked: (n, max) => `${n} von ${max} Orten markiert`,
    mapRemoveHint: 'Tippen Sie auf einen Marker, um ihn wieder zu entfernen.',
    mapMaxReached: 'Maximal 10 Orte erreicht — entfernen Sie einen, um einen neuen zu setzen.',
    riverLabel: 'Emscher',
    cancel: 'Abbrechen',
    errorPrefix: 'Die Antwort konnte nicht gesendet werden. Bitte versuchen Sie es erneut. (',
  },
  en: {
    pageTitle: 'LiFRES — Flood Risk & Green Space — Survey',
    brand: 'LiFRES',
    brandTagline: 'A Spatial Perspective from Germany',
    themeToggleLabel: 'Toggle color scheme',
    langToggleLabel: 'Change language',
    back: '← Back',
    next: 'Next →',
    questionOf: (n) => `Question ${n} of 10`,
    consent: {
      title: 'Flood Risk & Access to Nature',
      desc: 'This survey explores how residents perceive flood risk and green/blue spaces in their neighborhood. Your answers help improve planning for nature access and flood protection.',
      item1: '<strong>Duration:</strong> approx. 8–12 minutes',
      item2: '<strong>Map:</strong> You can mark up to 10 places per map question',
      item3: '<strong>Anonymous:</strong> Your answers are evaluated without any names',
      privacyTitle: 'Data protection & consent',
      privacyText: 'Participation in this study is voluntary and fully anonymous. No names, email addresses, or other directly identifying information is collected. The location and response data collected will be used exclusively for scientific purposes within this research project and processed in accordance with the principles of the General Data Protection Regulation (GDPR). The study was designed in line with the guidelines of the responsible ethics committee. You may withdraw at any time without giving a reason; however, anonymous data already submitted cannot be uniquely identified and removed afterwards. By submitting the survey, you consent to the processing of your anonymous data for the purposes described above.',
      privacyNote: 'Note: The final wording approved by the ethics committee will be inserted here once available.',
      consentLabel: 'I have read the information above and voluntarily agree to participate anonymously in this study.',
      langLabel: 'Choose language',
      start: 'Start survey →',
      needConsent: 'Please confirm your consent to continue.',
      partner: 'A survey in collaboration with',
    },
    location: {
      title: 'Your city area',
      desc: 'Please select the city area your answers should relate to. The maps in the following questions will then show your city.',
      dortmund: 'Dortmund',
      bochum: 'Bochum',
      essen: 'Essen',
      bochumNote: 'Note: the Emscher itself does not flow through Bochum’s city area — it is marked on the map at the nearest point just north of the city boundary.',
      needSelection: 'Please select a city area to continue.',
    },
    q1: {
      title: 'Flood risk in your neighborhood',
      desc: 'On the map below, please mark the area(s) in your neighborhood or daily routine that you consider to be at high risk of flooding.',
      hint: 'Tap the map to mark a place',
      popupTitle: 'How severe do you think the flood risk is here?',
    },
    q2: {
      title: 'Green and blue spaces you use',
      desc: 'Please mark the green or blue spaces (parks, gardens, riverbanks, green corridors, etc.) that you regularly visit or value.',
      hint: 'Mark place(s)',
    },
    q3: {
      title: 'Spaces that help reduce flooding',
      desc: 'Which of these or other green/blue spaces do you think help reduce flooding or absorb rainwater in your area? You can select existing places from question 2 (light markers) or mark new ones.',
      hint: 'Select an existing place or mark a new one',
      popupTitle: 'Does this space help reduce flooding or absorb rainwater?',
    },
    q4: {
      title: 'Safe recreational areas near water',
      desc: 'Please mark any areas near rivers, streams, or retention basins that you consider safe to use for recreation, even during heavy rain.',
      hint: 'Mark place(s)',
    },
    q5: {
      title: 'Concern about flooding',
      desc: 'How concerned are you about flooding affecting your home or neighborhood in the next 10 years?',
      low: 'Not at all concerned', high: 'Extremely concerned',
    },
    q6: {
      title: 'Benefits of green and blue spaces',
      desc: 'Please rank the following benefits of green/blue spaces in your area from most important (1) to least important (6) to you.',
    },
    q7: {
      title: 'Past flood exposure',
      desc: 'Have you or your household ever been directly affected by flooding (e.g. flooding of your home, basement, or garden)?',
      yes: 'Yes', no: 'No',
      descLabel: 'Please briefly describe what happened and where.',
      placeholder: 'What happened, when and where …',
      orAudio: 'or as a voice recording',
      recordStart: 'Start recording',
      recordStop: 'Stop recording',
      recordHint: 'Your recording will be stored and listened to by our team later.',
      recordUploading: 'Saving recording …',
      recordSaved: 'Recording saved.',
      recordError: 'The recording could not be saved. Please try again or use the text field.',
      removeAudio: 'Remove recording',
      micUnavailable: 'Microphone not available in this browser. Please use the text field.',
    },
    q8: {
      title: 'Desired measures',
      desc: 'What measures do you think would most help reduce flood risk and improve access to nature where you live?',
      placeholder: 'Your suggestions …',
    },
    q9: {
      title: 'About you',
      ageLabel: 'Age group',
      genderLabel: 'Gender',
      educationLabel: 'Highest level of education',
    },
    q10: {
      title: 'Residence & exposure',
      postalLabel: 'Postal code or district',
      postalPlaceholder: 'e.g. 44787',
      yearsLabel: 'Years lived at current address',
      distanceGreenLabel: 'Approximate distance to nearest green space',
      distanceWaterLabel: 'Approximate distance to nearest watercourse',
    },
    review: {
      kicker: 'Almost done',
      title: 'Overview',
      desc: 'Please review your answers before submitting.',
      labels: {
        location: 'Selected city area',
        q1: 'Flood risk places', q2: 'Green/blue spaces', q3: 'Flood-protection spaces',
        q4: 'Safe recreational areas', q5: 'Concern about flooding', q6: 'Benefit ranking',
        q7: 'Past exposure', q8: 'Desired measures', q9: 'Personal details', q10: 'Residence & exposure',
      },
      yes: 'Yes', no: 'No', notSet: '—',
      submit: 'Submit ✓',
      sending: 'Sending …',
    },
    done: {
      title: 'Thank you!',
      desc: 'Your answers have been submitted successfully and help us better understand flood protection and access to nature in our neighborhood.',
      again: 'Submit another response',
    },
    placesMarked: (n) => n === 0 ? 'no place marked' : `${n} place${n === 1 ? '' : 's'} marked`,
    mapMarked: (n, max) => `${n} of ${max} places marked`,
    mapRemoveHint: 'Tap a marker to remove it.',
    mapMaxReached: 'Maximum of 10 places reached — remove one to add a new one.',
    riverLabel: 'Emscher',
    cancel: 'Cancel',
    errorPrefix: 'The response could not be sent. Please try again. (',
  },
};

function t() {
  return TRANSLATIONS[state.lang];
}

// ----------------------------------------------------------------------------
// Step definitions
// ----------------------------------------------------------------------------
const steps = [
  { id: 'consent', kind: 'consent' },
  { id: 'location', kind: 'location' },
  { id: 'q1', kind: 'mapSeverity', key: 'q1', qNum: 1 },
  { id: 'q2', kind: 'mapSimple', key: 'q2', qNum: 2 },
  { id: 'q3', kind: 'mapService', key: 'q3', qNum: 3 },
  { id: 'q4', kind: 'mapSimple', key: 'q4', qNum: 4 },
  { id: 'q5', kind: 'scale', key: 'q5', qNum: 5 },
  { id: 'q6', kind: 'rank', qNum: 6 },
  { id: 'q7', kind: 'exposure', qNum: 7 },
  { id: 'q8', kind: 'textarea', key: 'q8', qNum: 8 },
  { id: 'q9', kind: 'demo9', qNum: 9 },
  { id: 'q10', kind: 'demo10', qNum: 10 },
  { id: 'review', kind: 'review' },
  { id: 'done', kind: 'done' },
];

// ----------------------------------------------------------------------------
// Rendering
// ----------------------------------------------------------------------------
const stage = document.getElementById('stage');
const progressFill = document.getElementById('progressFill');

function updateProgress() {
  const pct = Math.min(100, Math.round((state.step / (steps.length - 1)) * 100));
  progressFill.style.width = pct + '%';
}

function render() {
  updateProgress();
  const step = steps[state.step];
  stage.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'step';
  el.appendChild(renderStep(step));
  stage.appendChild(el);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function nav(canGoBack, nextLabel, onNext, nextDisabled) {
  const tr = t();
  const wrap = document.createElement('div');
  wrap.className = 'step-nav';
  const back = document.createElement('button');
  back.className = 'btn btn-ghost';
  back.textContent = tr.back;
  back.style.visibility = canGoBack ? 'visible' : 'hidden';
  back.onclick = () => { state.step--; render(); };
  const next = document.createElement('button');
  next.className = 'btn btn-primary';
  next.textContent = nextLabel || tr.next;
  next.disabled = !!nextDisabled;
  next.onclick = onNext;
  wrap.append(back, next);
  return wrap;
}

// ----------------------------------------------------------------------------
// Modal (used for per-point follow-up questions on the map)
// ----------------------------------------------------------------------------
const modalOverlay = document.getElementById('modalOverlay');
const modalTitleEl = document.getElementById('modalTitle');
const modalOptionsEl = document.getElementById('modalOptions');
const modalCancelEl = document.getElementById('modalCancel');

function openModal(title, options, onPick, onCancel) {
  modalTitleEl.textContent = title;
  modalOptionsEl.innerHTML = '';
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'modal-option-btn';
    btn.textContent = opt.label;
    btn.onclick = () => { closeModal(); onPick(opt.value); };
    modalOptionsEl.appendChild(btn);
  });
  modalCancelEl.textContent = t().cancel;
  modalCancelEl.onclick = () => { closeModal(); if (onCancel) onCancel(); };
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}

function renderStep(step) {
  const frag = document.createElement('div');
  const tr = t();

  if (step.kind === 'consent') {
    const cs = tr.consent;
    frag.innerHTML = `
      <h1 class="step-title">${cs.title}</h1>
      <p class="step-desc">${cs.desc}</p>
      <div class="intro-list">
        <div class="intro-item">${ICONS.clock}<p>${cs.item1}</p></div>
        <div class="intro-item">${ICONS.map}<p>${cs.item2}</p></div>
        <div class="intro-item">${ICONS.shield}<p>${cs.item3}</p></div>
      </div>
      <h2 class="step-title" style="font-size: var(--text-base); margin-top: var(--space-6);">${cs.privacyTitle}</h2>
      <div class="consent-text"><p>${cs.privacyText}</p><p><em>${cs.privacyNote}</em></p></div>
    `;

    const consentCheck = document.createElement('label');
    consentCheck.className = 'consent-check';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.consentChecked;
    const span = document.createElement('span');
    span.textContent = cs.consentLabel;
    consentCheck.append(cb, span);
    frag.appendChild(consentCheck);

    const langField = document.createElement('div');
    langField.className = 'field-group';
    langField.innerHTML = `<label class="field-label">${cs.langLabel}</label>`;
    const langRow = document.createElement('div');
    langRow.className = 'exposed-toggle';
    ['de', 'en'].forEach(code => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'exposed-btn' + (state.lang === code ? ' selected' : '');
      b.textContent = code === 'de' ? 'Deutsch' : 'English';
      b.onclick = () => { setLang(code); };
      langRow.appendChild(b);
    });
    langField.appendChild(langRow);
    frag.appendChild(langField);

    if (state.submitError === 'consent') {
      const err = document.createElement('div');
      err.className = 'error-banner';
      err.textContent = cs.needConsent;
      frag.appendChild(err);
    }

    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const start = document.createElement('button');
    start.className = 'btn btn-primary';
    start.textContent = cs.start;
    start.onclick = () => {
      state.consentChecked = cb.checked;
      if (!state.consentChecked) { state.submitError = 'consent'; render(); return; }
      state.submitError = null;
      state.step++;
      render();
    };
    wrap.appendChild(start);
    frag.appendChild(wrap);

    const partner = document.createElement('div');
    partner.className = 'intro-partner';
    partner.innerHTML = `<span>${cs.partner}</span><img src="tu-dortmund-logo.svg" alt="TU Dortmund" class="partner-logo" />`;
    frag.appendChild(partner);
    return frag;
  }

  if (step.kind === 'location') {
    const stepTr = tr.location;
    const cities = [
      { code: 'dortmund', label: stepTr.dortmund },
      { code: 'bochum', label: stepTr.bochum },
      { code: 'essen', label: stepTr.essen },
    ];
    frag.innerHTML = `<h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const choice = document.createElement('div');
    choice.className = 'location-choice';
    cities.forEach(city => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'location-btn' + (state.data.location === city.code ? ' selected' : '');
      btn.textContent = city.label;
      btn.onclick = () => { state.data.location = city.code; render(); };
      choice.appendChild(btn);
    });
    frag.appendChild(choice);
    if (state.data.location === 'bochum') {
      const note = document.createElement('p');
      note.className = 'location-note';
      note.textContent = stepTr.bochumNote;
      frag.appendChild(note);
    }
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !state.data.location));
    return frag;
  }

  if (step.kind === 'mapSeverity' || step.kind === 'mapSimple' || step.kind === 'mapService') {
    const stepTr = tr[step.id];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const mapWrap = document.createElement('div');
    mapWrap.className = 'map-wrap';
    const mapId = 'map-' + step.id;
    const count = state.data[step.key].length;
    const hintText = count > 0 ? tr.mapMarked(count, MAX_POINTS) : stepTr.hint;
    mapWrap.innerHTML = `<div class="map-hint ${count > 0 ? 'placed' : ''}" id="hint-${step.id}">${hintText}</div><div class="map-el" id="${mapId}"></div>`;
    frag.appendChild(mapWrap);

    const note = document.createElement('p');
    note.className = 'map-note';
    note.id = 'note-' + step.id;
    note.textContent = count > 0 ? tr.mapRemoveHint : '';
    frag.appendChild(note);

    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, count === 0));

    requestAnimationFrame(() => {
      if (step.kind === 'mapSeverity') initSeverityMap(step, mapId);
      else if (step.kind === 'mapService') initServiceMap(step, mapId);
      else initSimpleMap(step, mapId);
    });
    return frag;
  }

  if (step.kind === 'scale') {
    const stepTr = tr[step.id];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    frag.appendChild(buildScaleRow(step.key, stepTr.low, stepTr.high));
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !state.data[step.key]));
    return frag;
  }

  if (step.kind === 'rank') {
    const stepTr = tr.q6;
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    frag.appendChild(buildRankList());
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'exposure') {
    frag.appendChild(buildExposureStep());
    return frag;
  }

  if (step.kind === 'textarea') {
    const stepTr = tr[step.id];
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;
    const ta = document.createElement('textarea');
    ta.rows = 4;
    ta.placeholder = stepTr.placeholder;
    ta.value = state.data.q8;
    ta.oninput = () => { state.data.q8 = ta.value; };
    frag.appendChild(ta);
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'demo9') {
    const stepTr = tr.q9;
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2>`;
    frag.appendChild(buildSelectField(stepTr.ageLabel, 'age_group', 'q9_age_group'));
    frag.appendChild(buildSelectField(stepTr.genderLabel, 'gender', 'q9_gender'));
    frag.appendChild(buildSelectField(stepTr.educationLabel, 'education', 'q9_education'));
    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'demo10') {
    const stepTr = tr.q10;
    frag.innerHTML = `<p class="step-kicker">${tr.questionOf(step.qNum)}</p><h2 class="step-title">${stepTr.title}</h2>`;

    const postalField = document.createElement('div');
    postalField.className = 'field-group';
    postalField.innerHTML = `<label class="field-label">${stepTr.postalLabel}</label>`;
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = stepTr.postalPlaceholder;
    input.value = state.data.q10_postal_code;
    input.maxLength = 40;
    input.oninput = () => { state.data.q10_postal_code = input.value; };
    postalField.appendChild(input);
    frag.appendChild(postalField);

    frag.appendChild(buildSelectField(stepTr.yearsLabel, 'years_at_address', 'q10_years_at_address'));
    frag.appendChild(buildSelectField(stepTr.distanceGreenLabel, 'distance_band', 'q10_distance_green'));
    frag.appendChild(buildSelectField(stepTr.distanceWaterLabel, 'distance_band', 'q10_distance_water'));

    frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, false));
    return frag;
  }

  if (step.kind === 'review') {
    const rv = tr.review;
    frag.innerHTML = `<p class="step-kicker">${rv.kicker}</p><h2 class="step-title">${rv.title}</h2><p class="step-desc">${rv.desc}</p>`;
    const list = document.createElement('div');
    list.className = 'review-list';
    const locationLabels = { dortmund: tr.location.dortmund, bochum: tr.location.bochum, essen: tr.location.essen };
    const rows = [
      [rv.labels.location, state.data.location ? locationLabels[state.data.location] : rv.notSet],
      [rv.labels.q1, tr.placesMarked(state.data.q1.length)],
      [rv.labels.q2, tr.placesMarked(state.data.q2.length)],
      [rv.labels.q3, tr.placesMarked(state.data.q3.length)],
      [rv.labels.q4, tr.placesMarked(state.data.q4.length)],
      [rv.labels.q5, (state.data.q5 || rv.notSet) + (state.data.q5 ? ' / 5' : '')],
      [rv.labels.q6, state.data.q6.map((k, i) => `${i + 1}. ${RANK_ITEMS[k][state.lang]}`).join(' · ')],
      [rv.labels.q7, state.data.q7_exposed === 'yes' ? rv.yes : (state.data.q7_exposed === 'no' ? rv.no : rv.notSet)],
      [rv.labels.q8, state.data.q8 ? state.data.q8.slice(0, 60) + (state.data.q8.length > 60 ? '…' : '') : rv.notSet],
      [rv.labels.q9, [state.data.q9_age_group, state.data.q9_gender, state.data.q9_education].filter(Boolean).length + ' / 3'],
      [rv.labels.q10, [state.data.q10_postal_code, state.data.q10_years_at_address, state.data.q10_distance_green, state.data.q10_distance_water].filter(Boolean).length + ' / 4'],
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'review-row';
      row.innerHTML = `<span class="k">${k}</span><span class="v">${v}</span>`;
      list.appendChild(row);
    });
    frag.appendChild(list);

    if (state.submitError && state.submitError !== 'consent') {
      const err = document.createElement('div');
      err.className = 'error-banner';
      err.textContent = state.submitError;
      frag.appendChild(err);
    }

    frag.appendChild(nav(true, state.submitting ? rv.sending : rv.submit, submitSurvey, state.submitting));
    return frag;
  }

  if (step.kind === 'done') {
    const dn = tr.done;
    frag.innerHTML = `
      <div class="thank-icon">${ICONS.check}</div>
      <h2 class="step-title">${dn.title}</h2>
      <p class="step-desc">${dn.desc}</p>`;
    const wrap = document.createElement('div');
    wrap.className = 'step-nav';
    wrap.style.justifyContent = 'flex-end';
    const again = document.createElement('button');
    again.className = 'btn btn-ghost';
    again.textContent = dn.again;
    again.onclick = () => { resetState(); render(); };
    wrap.appendChild(again);
    frag.appendChild(wrap);
    return frag;
  }

  return frag;
}

function buildScaleRow(key, lowLabel, highLabel) {
  const wrap = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'scale-row';
  for (let i = 1; i <= 5; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scale-btn' + (state.data[key] === i ? ' selected' : '');
    btn.textContent = i;
    btn.onclick = () => { state.data[key] = i; render(); };
    row.appendChild(btn);
  }
  const caption = document.createElement('div');
  caption.className = 'scale-caption';
  caption.innerHTML = `<span>${lowLabel}</span><span>${highLabel}</span>`;
  wrap.append(row, caption);
  return wrap;
}

function buildSelectField(labelText, optionKey, stateKey) {
  const def = OPTION_DEFS[optionKey];
  const labels = def.labels[state.lang];
  const wrap = document.createElement('div');
  wrap.className = 'field-group';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.textContent = labelText;
  wrap.appendChild(label);
  const select = document.createElement('select');
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = state.lang === 'de' ? '— Bitte wählen —' : '— Please select —';
  select.appendChild(emptyOpt);
  def.codes.forEach((code, i) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = labels[i];
    if (state.data[stateKey] === code) opt.selected = true;
    select.appendChild(opt);
  });
  select.onchange = () => { state.data[stateKey] = select.value || null; };
  wrap.appendChild(select);
  return wrap;
}

function buildRankList() {
  const wrap = document.createElement('div');
  wrap.className = 'rank-list';
  function renderList() {
    wrap.innerHTML = '';
    state.data.q6.forEach((key, i) => {
      const item = document.createElement('div');
      item.className = 'rank-item';
      const num = document.createElement('span');
      num.className = 'rank-num';
      num.textContent = i + 1;
      const label = document.createElement('span');
      label.className = 'rank-label';
      label.textContent = RANK_ITEMS[key][state.lang];
      const controls = document.createElement('div');
      controls.className = 'rank-controls';
      const up = document.createElement('button');
      up.type = 'button';
      up.className = 'rank-btn';
      up.textContent = '↑';
      up.disabled = i === 0;
      up.onclick = () => {
        [state.data.q6[i - 1], state.data.q6[i]] = [state.data.q6[i], state.data.q6[i - 1]];
        renderList();
      };
      const down = document.createElement('button');
      down.type = 'button';
      down.className = 'rank-btn';
      down.textContent = '↓';
      down.disabled = i === state.data.q6.length - 1;
      down.onclick = () => {
        [state.data.q6[i + 1], state.data.q6[i]] = [state.data.q6[i], state.data.q6[i + 1]];
        renderList();
      };
      controls.append(up, down);
      item.append(num, label, controls);
      wrap.appendChild(item);
    });
  }
  renderList();
  return wrap;
}

// ----------------------------------------------------------------------------
// Exposure step (Q7): yes/no + conditional text or audio recording
// ----------------------------------------------------------------------------
function buildExposureStep() {
  const tr = t();
  const stepTr = tr.q7;
  const frag = document.createElement('div');
  frag.innerHTML = `<p class="step-kicker">${tr.questionOf(7)}</p><h2 class="step-title">${stepTr.title}</h2><p class="step-desc">${stepTr.desc}</p>`;

  const toggle = document.createElement('div');
  toggle.className = 'exposed-toggle';
  const yesBtn = document.createElement('button');
  yesBtn.type = 'button';
  yesBtn.className = 'exposed-btn' + (state.data.q7_exposed === 'yes' ? ' selected' : '');
  yesBtn.textContent = stepTr.yes;
  const noBtn = document.createElement('button');
  noBtn.type = 'button';
  noBtn.className = 'exposed-btn' + (state.data.q7_exposed === 'no' ? ' selected' : '');
  noBtn.textContent = stepTr.no;
  yesBtn.onclick = () => { state.data.q7_exposed = 'yes'; render(); };
  noBtn.onclick = () => { state.data.q7_exposed = 'no'; state.data.q7_description = ''; state.data.q7_audio_filename = null; render(); };
  toggle.append(yesBtn, noBtn);
  frag.appendChild(toggle);

  if (state.data.q7_exposed === 'yes') {
    const label = document.createElement('label');
    label.className = 'field-label';
    label.textContent = stepTr.descLabel;
    frag.appendChild(label);
    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.placeholder = stepTr.placeholder;
    ta.value = state.data.q7_description;
    ta.oninput = () => { state.data.q7_description = ta.value; };
    frag.appendChild(ta);

    const orLabel = document.createElement('p');
    orLabel.className = 'audio-hint';
    orLabel.style.margin = 'var(--space-3) 0';
    orLabel.textContent = stepTr.orAudio;
    frag.appendChild(orLabel);

    frag.appendChild(buildAudioRecorder(stepTr));
  }

  frag.appendChild(nav(true, tr.next, () => { state.step++; render(); }, !state.data.q7_exposed));
  return frag;
}

function buildAudioRecorder(stepTr) {
  const box = document.createElement('div');
  box.className = 'audio-recorder';

  const hasRecorder = typeof window.MediaRecorder !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;

  if (!hasRecorder) {
    box.innerHTML = `<p class="audio-hint">${stepTr.micUnavailable}</p>`;
    return box;
  }

  const row = document.createElement('div');
  row.className = 'audio-controls-row';

  const recBtn = document.createElement('button');
  recBtn.type = 'button';
  recBtn.className = 'record-btn' + (state.audio.recording ? ' recording' : '');
  recBtn.innerHTML = (state.audio.recording ? ICONS.stop : ICONS.mic) + `<span>${state.audio.recording ? stepTr.recordStop : stepTr.recordStart}</span>`;
  recBtn.disabled = state.audio.uploading;
  recBtn.onclick = () => {
    if (state.audio.recording) stopRecording();
    else startRecording();
  };
  row.appendChild(recBtn);
  box.appendChild(row);

  if (state.audio.uploading) {
    const p = document.createElement('p');
    p.className = 'audio-hint';
    p.textContent = stepTr.recordUploading;
    box.appendChild(p);
  } else if (state.audio.uploadError) {
    const p = document.createElement('p');
    p.className = 'audio-hint';
    p.style.color = 'var(--color-danger)';
    p.textContent = stepTr.recordError;
    box.appendChild(p);
  } else if (state.data.q7_audio_filename) {
    const p = document.createElement('p');
    p.className = 'audio-hint';
    p.textContent = stepTr.recordSaved;
    box.appendChild(p);
    if (state.audio.blobUrl) {
      const audioEl = document.createElement('audio');
      audioEl.controls = true;
      audioEl.src = state.audio.blobUrl;
      box.appendChild(audioEl);
    }
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'remove-audio-btn';
    removeBtn.textContent = stepTr.removeAudio;
    removeBtn.onclick = () => {
      state.data.q7_audio_filename = null;
      state.audio.blobUrl = null;
      render();
    };
    box.appendChild(removeBtn);
  } else if (!state.audio.recording) {
    const p = document.createElement('p');
    p.className = 'audio-hint';
    p.textContent = stepTr.recordHint;
    box.appendChild(p);
  }

  return box;
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mediaRecorder = new MediaRecorder(stream);
    state.audio.chunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) state.audio.chunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(tr => tr.stop());
      const blob = new Blob(state.audio.chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      state.audio.blobUrl = URL.createObjectURL(blob);
      await uploadAudio(blob);
    };
    mediaRecorder.start();
    state.audio.mediaRecorder = mediaRecorder;
    state.audio.recording = true;
    render();
  } catch (err) {
    state.audio.uploadError = true;
    render();
  }
}

function stopRecording() {
  if (state.audio.mediaRecorder && state.audio.recording) {
    state.audio.mediaRecorder.stop();
    state.audio.recording = false;
    render();
  }
}

async function uploadAudio(blob) {
  state.audio.uploading = true;
  state.audio.uploadError = null;
  render();
  try {
    const form = new FormData();
    const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
    form.append('file', blob, `recording.${ext}`);
    const res = await fetch(`${API}/api/upload-audio`, { method: 'POST', body: form });
    if (!res.ok) throw new Error('upload failed');
    const json = await res.json();
    state.data.q7_audio_filename = json.filename;
    state.audio.uploading = false;
    render();
  } catch (err) {
    state.audio.uploading = false;
    state.audio.uploadError = true;
    render();
  }
}

// ----------------------------------------------------------------------------
// Map handling (Leaflet)
// ----------------------------------------------------------------------------
function updateMapHint(step) {
  const hint = document.getElementById('hint-' + step.id);
  const note = document.getElementById('note-' + step.id);
  if (!hint) return;
  const tr = t();
  const count = state.data[step.key].length;
  if (count === 0) {
    hint.textContent = tr[step.id].hint;
    hint.classList.remove('placed');
    if (note) note.textContent = '';
  } else {
    hint.textContent = tr.mapMarked(count, MAX_POINTS);
    hint.classList.add('placed');
    if (note) note.textContent = tr.mapRemoveHint;
  }
}

function updateNextButtonState(step) {
  const nextBtn = document.querySelector('.btn-primary');
  if (nextBtn) nextBtn.disabled = state.data[step.key].length === 0;
}

function flashMaxHint(step) {
  const hint = document.getElementById('hint-' + step.id);
  if (!hint) return;
  const tr = t();
  hint.textContent = tr.mapMaxReached;
  setTimeout(() => updateMapHint(step), 1600);
}

function makeMap(mapId) {
  const locKey = state.data.location && LOCATIONS[state.data.location] ? state.data.location : 'bochum';
  const loc = LOCATIONS[locKey];
  const map = L.map(mapId, { zoomControl: true }).setView([loc.lat, loc.lng], loc.zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
  drawEmscherRiver(map, locKey);
  setTimeout(() => map.invalidateSize(), 50);
  return map;
}

// Draws the Emscher river in bold on the map so respondents can orient
// themselves relative to it. For Bochum, whose city area the river does not
// actually pass through, also attaches a small note near the nearest stretch.
function drawEmscherRiver(map, locKey) {
  const tr = t();
  let lastLine = null;
  EMSCHER_SEGMENTS.forEach(seg => {
    lastLine = L.polyline(seg, { color: '#1565c0', weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  });
  const loc = LOCATIONS[locKey];
  if (loc && loc.riverOutsideCity && lastLine) {
    const labelPoint = [51.5635, 7.226];
    L.tooltip({ permanent: true, direction: 'top', className: 'river-label', offset: [0, -6] })
      .setLatLng(labelPoint)
      .setContent(tr.riverLabel)
      .addTo(map);
  } else if (lastLine) {
    const midIdx = Math.floor(EMSCHER_SEGMENTS[0].length / 2);
    L.tooltip({ permanent: true, direction: 'top', className: 'river-label', offset: [0, -6] })
      .setLatLng(EMSCHER_SEGMENTS[0][midIdx] || EMSCHER_SEGMENTS[0][0])
      .setContent(tr.riverLabel)
      .addTo(map);
  }
}

// Q2 / Q4 — simple point-only maps, no follow-up question
function initSimpleMap(step, mapId) {
  const container = document.getElementById(mapId);
  if (!container) return;
  const map = makeMap(mapId);
  const pointsRef = state.data[step.key];

  function addMarkerFor(point) {
    const marker = L.marker([point.lat, point.lng]).addTo(map);
    marker.on('click', (ev) => {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      const idx = pointsRef.indexOf(point);
      if (idx !== -1) pointsRef.splice(idx, 1);
      map.removeLayer(marker);
      updateMapHint(step);
      updateNextButtonState(step);
    });
    return marker;
  }

  pointsRef.forEach(addMarkerFor);

  map.on('click', (e) => {
    if (pointsRef.length >= MAX_POINTS) { flashMaxHint(step); return; }
    const point = { lat: e.latlng.lat, lng: e.latlng.lng };
    pointsRef.push(point);
    addMarkerFor(point);
    updateMapHint(step);
    updateNextButtonState(step);
  });

  updateMapHint(step);
}

// Q1 — flood risk map with a severity follow-up popup per marked point
function initSeverityMap(step, mapId) {
  const container = document.getElementById(mapId);
  if (!container) return;
  const map = makeMap(mapId);
  const pointsRef = state.data.q1;
  const tr = t();
  const severityDef = OPTION_DEFS.severity;

  function severityIcon(sev) {
    const colors = { 1: '#5b8a72', 2: '#8aa563', 3: '#d8a83b', 4: '#d97b3b', 5: '#c24a3f' };
    const c = colors[sev] || '#2f6f5e';
    return L.divIcon({
      className: '',
      html: `<div style="width:22px;height:22px;border-radius:50%;background:${c};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  function addMarkerFor(point) {
    const marker = L.marker([point.lat, point.lng], { icon: severityIcon(point.severity) }).addTo(map);
    marker.on('click', (ev) => {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      const idx = pointsRef.indexOf(point);
      if (idx !== -1) pointsRef.splice(idx, 1);
      map.removeLayer(marker);
      updateMapHint(step);
      updateNextButtonState(step);
    });
    return marker;
  }

  pointsRef.forEach(addMarkerFor);

  map.on('click', (e) => {
    if (pointsRef.length >= MAX_POINTS) { flashMaxHint(step); return; }
    const point = { lat: e.latlng.lat, lng: e.latlng.lng, severity: null };
    const options = severityDef.codes.map((code, i) => ({ value: code, label: severityDef.labels[state.lang][i] }));
    openModal(tr.q1.popupTitle, options, (value) => {
      point.severity = value;
      pointsRef.push(point);
      addMarkerFor(point);
      updateMapHint(step);
      updateNextButtonState(step);
    }, null);
  });

  updateMapHint(step);
}

// Q3 — ecosystem-service map: select existing Q2 points (light markers) or draw new ones, then ask "helps"
function initServiceMap(step, mapId) {
  const container = document.getElementById(mapId);
  if (!container) return;
  const map = makeMap(mapId);
  const pointsRef = state.data.q3;
  const q2Points = state.data.q2;
  const tr = t();
  const helpsDef = OPTION_DEFS.helps;

  const q3PointIcon = L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:#2f6f5e;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4);"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
  const q2SuggestIcon = L.divIcon({
    className: '',
    html: `<div style="width:18px;height:18px;border-radius:50%;background:transparent;border:2.5px dashed #2f6f5e;"></div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
  });

  function askHelpsThen(makePoint) {
    const options = helpsDef.codes.map((code, i) => ({ value: code, label: helpsDef.labels[state.lang][i] }));
    openModal(tr.q3.popupTitle, options, (value) => {
      const point = makePoint();
      point.helps = value;
      pointsRef.push(point);
      addQ3MarkerFor(point);
      updateMapHint(step);
      updateNextButtonState(step);
    }, null);
  }

  function addQ3MarkerFor(point) {
    const marker = L.marker([point.lat, point.lng], { icon: q3PointIcon }).addTo(map);
    marker.on('click', (ev) => {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      const idx = pointsRef.indexOf(point);
      if (idx !== -1) pointsRef.splice(idx, 1);
      map.removeLayer(marker);
      updateMapHint(step);
      updateNextButtonState(step);
    });
    return marker;
  }

  pointsRef.forEach(addQ3MarkerFor);

  // Suggested markers from Q2 that have not yet been chosen for Q3
  const chosenFromQ2 = new Set(
    pointsRef.filter(p => p.source === 'q2').map(p => `${p.lat},${p.lng}`)
  );
  q2Points.forEach(q2pt => {
    const key = `${q2pt.lat},${q2pt.lng}`;
    if (chosenFromQ2.has(key)) return;
    const marker = L.marker([q2pt.lat, q2pt.lng], { icon: q2SuggestIcon }).addTo(map);
    marker.on('click', (ev) => {
      if (ev.originalEvent) L.DomEvent.stopPropagation(ev.originalEvent);
      if (pointsRef.length >= MAX_POINTS) { flashMaxHint(step); return; }
      map.removeLayer(marker);
      askHelpsThen(() => ({ lat: q2pt.lat, lng: q2pt.lng, source: 'q2' }));
    });
  });

  map.on('click', (e) => {
    if (pointsRef.length >= MAX_POINTS) { flashMaxHint(step); return; }
    askHelpsThen(() => ({ lat: e.latlng.lat, lng: e.latlng.lng, source: 'new' }));
  });

  updateMapHint(step);
}

// ----------------------------------------------------------------------------
// Submit
// ----------------------------------------------------------------------------
async function submitSurvey() {
  state.submitting = true;
  state.submitError = null;
  render();
  try {
    const d = state.data;
    const payload = {
      language: state.lang,
      location: d.location,
      q1_flood_points: d.q1,
      q2_green_points: d.q2,
      q3_service_points: d.q3,
      q4_safe_points: d.q4,
      q5_concern: d.q5,
      q6_ranking: d.q6,
      q7_exposed: d.q7_exposed,
      q7_description: d.q7_description,
      q7_audio_filename: d.q7_audio_filename,
      q8_measures: d.q8,
      q9_age_group: d.q9_age_group,
      q9_gender: d.q9_gender,
      q9_education: d.q9_education,
      q10_postal_code: d.q10_postal_code,
      q10_years_at_address: d.q10_years_at_address,
      q10_distance_green: d.q10_distance_green,
      q10_distance_water: d.q10_distance_water,
    };
    const res = await fetch(`${API}/api/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Server error');
    state.submitting = false;
    state.step++;
    render();
  } catch (err) {
    state.submitting = false;
    state.submitError = t().errorPrefix + err.message + ')';
    render();
  }
}

function resetState() {
  state.step = 0;
  state.consentChecked = false;
  state.data = {
    location: null,
    q1: [], q2: [], q3: [], q4: [],
    q5: null,
    q6: ['flood_absorption', 'recreation', 'wellbeing', 'biodiversity', 'cooling', 'aesthetic'],
    q7_exposed: null, q7_description: '', q7_audio_filename: null,
    q8: '',
    q9_age_group: null, q9_gender: null, q9_education: null,
    q10_postal_code: '', q10_years_at_address: null, q10_distance_green: null, q10_distance_water: null,
  };
  state.audio = { recording: false, mediaRecorder: null, chunks: [], blobUrl: null, uploading: false, uploadError: null };
  state.submitError = null;
}

// ----------------------------------------------------------------------------
// Theme toggle
// ----------------------------------------------------------------------------
const themeToggle = document.getElementById('themeToggle');
let theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
document.documentElement.setAttribute('data-theme', theme);
themeToggle.onclick = () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
};

// ----------------------------------------------------------------------------
// Language toggle (header buttons, kept in sync with the in-survey choice)
// ----------------------------------------------------------------------------
const langButtons = document.querySelectorAll('.lang-btn');

function updateStaticText() {
  const tr = t();
  const brandEl = document.querySelector('.brand-text span:first-child');
  if (brandEl) brandEl.textContent = tr.brand;
  const taglineEl = document.querySelector('.brand-tagline');
  if (taglineEl) taglineEl.textContent = tr.brandTagline || '';
  themeToggle.setAttribute('aria-label', tr.themeToggleLabel);
  document.title = tr.pageTitle;
  document.documentElement.lang = state.lang;
  langButtons.forEach(b => {
    b.classList.toggle('active', b.dataset.lang === state.lang);
    b.setAttribute('aria-pressed', b.dataset.lang === state.lang ? 'true' : 'false');
  });
}

function setLang(lang) {
  if (lang === state.lang) return;
  state.lang = lang;
  updateStaticText();
  render();
}

langButtons.forEach(b => { b.onclick = () => setLang(b.dataset.lang); });

let initialLang = 'de';
if ((navigator.language || '').toLowerCase().startsWith('en')) initialLang = 'en';
state.lang = initialLang;
updateStaticText();

render();
