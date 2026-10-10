export const catalog = [
  { id: 'bench', name: 'Bench press', muscle: 'Hrudník', equipment: 'Velká osa', cue: 'Lopatky opřené, kontrolovaný pohyb dolů.' },
  { id: 'incline', name: 'Incline dumbbell press', muscle: 'Hrudník', equipment: 'Jednoručky', cue: 'Lokty pod zápěstím, pevný střed těla.' },
  { id: 'row', name: 'Seated cable row', muscle: 'Záda', equipment: 'Kladka', cue: 'Táhni lokty dozadu, trup drž stabilní.' },
  { id: 'pulldown', name: 'Lat pulldown', muscle: 'Záda', equipment: 'Kladka', cue: 'Ramena dolů, pohyb začni lopatkami.' },
  { id: 'shoulder', name: 'Shoulder press', muscle: 'Ramena', equipment: 'Jednoručky', cue: 'Pevný střed, rozsah podle pohodlí ramen.' },
  { id: 'lateral', name: 'Lateral raise', muscle: 'Ramena', equipment: 'Jednoručky', cue: 'Lehký ohyb loktů, pomalu vrať dolů.' },
  { id: 'squat', name: 'Back squat', muscle: 'Nohy', equipment: 'Velká osa', cue: 'Celé chodidlo na zemi, kolena ve směru špiček.' },
  { id: 'rdl', name: 'Romanian deadlift', muscle: 'Nohy', equipment: 'Velká osa', cue: 'Boky dozadu, osa blízko těla.' },
  { id: 'legpress', name: 'Leg press', muscle: 'Nohy', equipment: 'Stroj', cue: 'Kontroluj rozsah, nepropínej násilně kolena.' },
  { id: 'curl', name: 'Dumbbell curl', muscle: 'Biceps', equipment: 'Jednoručky', cue: 'Lokty u těla, bez švihu.' },
  { id: 'triceps', name: 'Triceps pushdown', muscle: 'Triceps', equipment: 'Kladka', cue: 'Lokty u těla, kontrolovaný návrat.' },
  { id: 'plank', name: 'Plank', muscle: 'Core', equipment: 'Vlastní váha', cue: 'Rovná linie těla. Čas zapisuj do pole opakování v sekundách.' },
  { id: 'pushup', name: 'Push-up', muscle: 'Hrudník', equipment: 'Vlastní váha', cue: 'Pevný střed, kontrolovaný rozsah.' },
  { id: 'split', name: 'Bulgarian split squat', muscle: 'Nohy', equipment: 'Jednoručky', cue: 'Stabilní přední chodidlo, pohyb kontroluj.' },
];
export const templates = [
  { id: 'upper', name: 'Upper body A', label: 'Hrudník · Záda · Ramena', duration: 55, exercises: ['bench', 'row', 'incline', 'lateral', 'triceps'] },
  { id: 'lower', name: 'Lower body A', label: 'Kvadricepsy · Hamstringy · Core', duration: 50, exercises: ['squat', 'rdl', 'legpress', 'split', 'plank'] },
  { id: 'full', name: 'Full body', label: 'Celé tělo · Základní cviky', duration: 60, exercises: ['squat', 'bench', 'row', 'shoulder', 'curl'] },
];
