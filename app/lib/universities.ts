export interface University {
  domain: string;
  name: string;
  shortName: string;
  logoFile: string;
  color: string;
}

export const FEATURED_UNIVERSITIES: University[] = [
  { domain: "cam.ac.uk", name: "University of Cambridge", shortName: "Cambridge", logoFile: "cambridge.png", color: "#A3C1AD" },
  { domain: "ox.ac.uk", name: "University of Oxford", shortName: "Oxford", logoFile: "oxford.png", color: "#002147" },
  { domain: "imperial.ac.uk", name: "Imperial College London", shortName: "Imperial", logoFile: "imperial.svg", color: "#003E74" },
  { domain: "nottingham.ac.uk", name: "University of Nottingham", shortName: "Nottingham", logoFile: "nottingham.jpg", color: "#005B82" },
  { domain: "bham.ac.uk", name: "University of Birmingham", shortName: "Birmingham", logoFile: "birmingham.svg", color: "#6F2DA8" },
  { domain: "warwick.ac.uk", name: "University of Warwick", shortName: "Warwick", logoFile: "warwick.svg", color: "#5F2167" },
  { domain: "exeter.ac.uk", name: "University of Exeter", shortName: "Exeter", logoFile: "exeter.svg", color: "#00674F" },
  { domain: "kcl.ac.uk", name: "King's College London", shortName: "KCL", logoFile: "kcl.png", color: "#E31837" },
  { domain: "ucl.ac.uk", name: "University College London", shortName: "UCL", logoFile: "ucl.jpg", color: "#500778" },
  { domain: "ed.ac.uk", name: "University of Edinburgh", shortName: "Edinburgh", logoFile: "edinburgh.png", color: "#B90E31" },
  { domain: "manchester.ac.uk", name: "University of Manchester", shortName: "Manchester", logoFile: "manchester.jpg", color: "#7B2D8B" },
  { domain: "bristol.ac.uk", name: "University of Bristol", shortName: "Bristol", logoFile: "bristol.svg", color: "#B01C2E" },
  { domain: "lse.ac.uk", name: "London School of Economics", shortName: "LSE", logoFile: "lse.png", color: "#D50032" },
  { domain: "leeds.ac.uk", name: "University of Leeds", shortName: "Leeds", logoFile: "leeds.png", color: "#003C71" },
  { domain: "dur.ac.uk", name: "Durham University", shortName: "Durham", logoFile: "durham.png", color: "#7E317B" },
  { domain: "st-andrews.ac.uk", name: "University of St Andrews", shortName: "St Andrews", logoFile: "standrews.svg", color: "#00539B" },
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

export function getUniversityLogo(email: string): string | null {
  const atIndex = email.indexOf("@");
  if (atIndex === -1) return null;

  const domain = email.slice(atIndex + 1).toLowerCase();

  const featured = FEATURED_UNIVERSITIES.find(
    (u) => domain === u.domain || domain.endsWith("." + u.domain)
  );
  if (featured) return `/${featured.logoFile}`;

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
