export interface University {
  domain: string;
  name: string;
  shortName: string;
  logoFile: string;
}

export const FEATURED_UNIVERSITIES: University[] = [
  { domain: "cam.ac.uk", name: "University of Cambridge", shortName: "Cambridge", logoFile: "cambridge.png" },
  { domain: "ox.ac.uk", name: "University of Oxford", shortName: "Oxford", logoFile: "oxford.png" },
  { domain: "imperial.ac.uk", name: "Imperial College London", shortName: "Imperial", logoFile: "imperial.png" },
  { domain: "nottingham.ac.uk", name: "University of Nottingham", shortName: "Nottingham", logoFile: "nottingham.png" },
  { domain: "bham.ac.uk", name: "University of Birmingham", shortName: "Birmingham", logoFile: "birmingham.png" },
  { domain: "warwick.ac.uk", name: "University of Warwick", shortName: "Warwick", logoFile: "warwick.png" },
  { domain: "exeter.ac.uk", name: "University of Exeter", shortName: "Exeter", logoFile: "exeter.png" },
  { domain: "kcl.ac.uk", name: "King's College London", shortName: "KCL", logoFile: "kcl.png" },
  { domain: "ucl.ac.uk", name: "University College London", shortName: "UCL", logoFile: "ucl.png" },
  { domain: "ed.ac.uk", name: "University of Edinburgh", shortName: "Edinburgh", logoFile: "edinburgh.png" },
  { domain: "manchester.ac.uk", name: "University of Manchester", shortName: "Manchester", logoFile: "manchester.png" },
  { domain: "bristol.ac.uk", name: "University of Bristol", shortName: "Bristol", logoFile: "bristol.png" },
  { domain: "lse.ac.uk", name: "London School of Economics", shortName: "LSE", logoFile: "lse.png" },
  { domain: "leeds.ac.uk", name: "University of Leeds", shortName: "Leeds", logoFile: "leeds.png" },
  { domain: "dur.ac.uk", name: "Durham University", shortName: "Durham", logoFile: "durham.png" },
  { domain: "st-andrews.ac.uk", name: "University of St Andrews", shortName: "St Andrews", logoFile: "standrews.png" },
];

const EXTRA_DOMAIN_MAP: Record<string, string> = {
  "bath.ac.uk": "University of Bath",
  "york.ac.uk": "University of York",
  "gla.ac.uk": "University of Glasgow",
  "qmul.ac.uk": "Queen Mary University of London",
  "soton.ac.uk": "University of Southampton",
  "liv.ac.uk": "University of Liverpool",
  "shef.ac.uk": "University of Sheffield",
  "cardiff.ac.uk": "Cardiff University",
  "qub.ac.uk": "Queen's University Belfast",
  "surrey.ac.uk": "University of Surrey",
  "lancaster.ac.uk": "Lancaster University",
  "sussex.ac.uk": "University of Sussex",
  "reading.ac.uk": "University of Reading",
  "abdn.ac.uk": "University of Aberdeen",
  "swansea.ac.uk": "Swansea University",
  "uea.ac.uk": "University of East Anglia",
  "lboro.ac.uk": "Loughborough University",
  "herts.ac.uk": "University of Hertfordshire",
  "kent.ac.uk": "University of Kent",
  "port.ac.uk": "University of Portsmouth",
  "ntu.ac.uk": "Nottingham Trent University",
  "city.ac.uk": "City, University of London",
  "brunel.ac.uk": "Brunel University London",
  "aber.ac.uk": "Aberystwyth University",
  "dundee.ac.uk": "University of Dundee",
  "stir.ac.uk": "University of Stirling",
  "hw.ac.uk": "Heriot-Watt University",
  "rhul.ac.uk": "Royal Holloway, University of London",
};

export function getUniversityName(email: string): string | null {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return null;

  const domain = email.slice(atIndex + 1).toLowerCase();

  const featured = FEATURED_UNIVERSITIES.find(
    (u) => domain === u.domain || domain.endsWith("." + u.domain)
  );
  if (featured) return featured.name;

  for (const [key, name] of Object.entries(EXTRA_DOMAIN_MAP)) {
    if (domain === key || domain.endsWith("." + key)) return name;
  }

  if (domain.endsWith(".ac.uk")) {
    const prefix = domain.replace(".ac.uk", "").split(".").pop() || domain;
    return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} University`;
  }

  if (domain.endsWith(".edu")) {
    const prefix = domain.replace(".edu", "").split(".").pop() || domain;
    return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)} University`;
  }

  return null;
}

export function getUniversityShortName(email: string): string | null {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return null;

  const domain = email.slice(atIndex + 1).toLowerCase();

  const featured = FEATURED_UNIVERSITIES.find(
    (u) => domain === u.domain || domain.endsWith("." + u.domain)
  );
  if (featured) return featured.shortName;

  return getUniversityName(email);
}
