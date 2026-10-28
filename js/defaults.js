// Standard-Kategorien. Alles hier lässt sich in der App unter Einstellungen ändern.
// Stichwörter: passen am Wortanfang ("Mathe" findet auch "Mathematik"); mit "=" davor nur als ganzes Wort ("=Deutsch").
export const DEFAULT_CONFIG = {
  version: 1,
  einstellungen: { mindestpunkte: 2, abstandsfaktor: 1.5 },
  kategorien: [
    {
      id: 'schule', name: 'Schule', icon: '🎓', hue: 222,
      keywords: ['Hausaufgabe', 'Klausur', 'Berufsschule', 'Lernfeld', 'Referat', 'Unterricht', 'Arbeitsblatt', 'Schulnote',
        'Lehrer', 'Abschlussprüfung', 'Zwischenprüfung', 'Berichtsheft', 'Lernzettel', 'Aufgabe', 'Schule', 'Kapitelzusammenfassung',
        'Chemie', 'Psychologie', 'Geschichte', 'Politik'],
      faecher: [
        { id: 'deutsch', name: 'Deutsch', icon: '📖', hue: 8, keywords: ['=Deutsch', 'Deutschunterricht', 'Sonett', 'Expressionismus', 'Entfremdung', 'Stilmittel', 'Gedicht', 'Lyrik', 'Aufsatz', 'Erörterung', 'Textanalyse', 'Epoche', 'Charakteranalyse'] },
        { id: 'englisch', name: 'Englisch', icon: '🇬🇧', hue: 350, keywords: ['Englisch', 'Vokabel', 'Essay', 'Shakespeare', 'grammar', 'translate'] },
        { id: 'mathe', name: 'Mathe', icon: '📐', hue: 262, keywords: ['Mathe', 'Kurvendiskussion', 'Funktion', 'Ableitung', 'Integral', 'Gleichung', 'Wahrscheinlichkeit', 'Vektor', 'Stochastik'] },
        { id: 'biologie', name: 'Biologie', icon: '🧬', hue: 142, keywords: ['Biologie', 'Synapse', 'Signaltransduktion', 'Sinneszelle', 'genetisch', 'Genetik', 'Zelle', 'Hormon', 'Enzym', 'Evolution', 'Neuron'] },
        { id: 'physik', name: 'Physik', icon: '⚛️', hue: 200, keywords: ['Physik', 'Quantenmechanik', 'Photon', 'Strahlung', 'Elektron'] },
        { id: 'erdkunde', name: 'Erdkunde', icon: '🌍', hue: 28, keywords: ['Erdkunde', 'Geografie', 'Tourismus', 'Klima', 'Globalisierung', 'Stadtentwicklung', 'Landwirtschaft'] },
        { id: 'ethik', name: 'Ethik', icon: '⚖️', hue: 300, keywords: ['Ethik', 'ethisch', 'Kohlberg', 'Moral', 'Gerechtigkeit', 'Utilitarismus', 'Kant'] },
        { id: 'kunst', name: 'Kunst', icon: '🎨', hue: 330, keywords: ['Kunst', 'Bildanalyse', 'Gemälde', 'Maler', 'Skulptur', 'Künstler'] },
        { id: 'sport', name: 'Sport', icon: '🏃', hue: 175, keywords: ['=Sport', 'Sporttheorie', 'Ausdauer', 'Trainingslehre'] },
        { id: 'skg', name: 'SkG', icon: '🏛️', hue: 45, keywords: ['=SkG'] },
      ],
    },
    {
      id: 'privat', name: 'Privat', icon: '🏠', hue: 160,
      keywords: ['Rezept', 'Urlaub', 'Geschenk', 'Wohnung', 'Geburtstag', 'Kochen', 'Reise', 'Fitness', 'Gesundheit', 'Familie',
        'Wochenende', 'Einkauf', 'Motorrad', 'Auto', 'Führerschein', 'Kennzeichen', 'Miete', '=Film', '=Serie'],
      faecher: [],
    },
    {
      id: 'arbeit', name: 'Arbeit/Handwerk', icon: '🛠️', hue: 32,
      keywords: ['Baustelle', 'Handwerk', 'Werkzeug', 'Montage', 'Aufmaß', 'Geselle', 'Meister', 'Arbeitsauftrag', 'Bauteil',
        'Kollege', 'Arbeitsschutz', 'Rigips', 'Spachtel', 'Trockenbau', 'Dämmung', 'Angebot', 'Kunde', 'Kalkulation', '=Chef'],
      faecher: [],
    },
    { id: 'sonstiges', name: 'Sonstiges', icon: '🗂️', hue: 215, keywords: [], faecher: [] },
  ],
};
