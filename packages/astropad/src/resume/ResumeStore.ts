import { persistentAtom } from '@nanostores/persistent';

interface Location {
  address: string;
  postalCode: string;
  city: string;
  countryCode: string;
  region: string;
}

interface Profile {
  network: string;
  username: string;
  url: string;
}

interface Basics {
  name: string;
  label: string;
  image: string;
  email: string;
  phone: string;
  url: string;
  summary: string;
  location: Location;
  profiles: Profile[];
}

interface Work {
  name: string;
  position: string;
  url: string;
  startDate: string;
  endDate: string;
  summary: string;
  highlights: string[];
}

interface Volunteer {
  organization: string;
  position: string;
  url: string;
  startDate: string;
  endDate: string;
  summary: string;
  highlights: string[];
}

interface Education {
  institution: string;
  url: string;
  area: string;
  studyType: string;
  startDate: string;
  endDate: string;
  score: string;
  courses: string[];
}

interface Award {
  title: string;
  date: string;
  awarder: string;
  summary: string;
}

interface Certificate {
  name: string;
  date: string;
  issuer: string;
  url: string;
}

interface Publication {
  name: string;
  publisher: string;
  releaseDate: string;
  url: string;
  summary: string;
}

interface Skill {
  name: string;
  level: string;
  keywords: string[];
}

interface Language {
  language: string;
  fluency: string;
}

interface Interest {
  name: string;
  keywords: string[];
}

interface Reference {
  name: string;
  reference: string;
}

interface Project {
  name: string;
  startDate: string;
  endDate: string;
  description: string;
  highlights: string[];
  url: string;
}

interface Resume {
  basics: Basics;
  work: Work[];
  volunteer: Volunteer[];
  education: Education[];
  awards: Award[];
  certificates: Certificate[];
  publications: Publication[];
  skills: Skill[];
  languages: Language[];
  interests: Interest[];
  references: Reference[];
  projects: Project[];
}

const initialResume: Resume = {
  basics: {
    name: '',
    label: '',
    image: '',
    email: '',
    phone: '',
    url: '',
    summary: '',
    location: {
      address: '',
      postalCode: '',
      city: '',
      countryCode: '',
      region: '',
    },
    profiles: [
      {
        network: '',
        username: '',
        url: '',
      },
    ],
  },
  work: [],
  volunteer: [],
  education: [],
  awards: [],
  certificates: [],
  publications: [],
  skills: [],
  languages: [],
  interests: [],
  references: [],
  projects: [],
};

export const resume = persistentAtom<Resume>('resume', initialResume, {
  encode(value) {
    return JSON.stringify(value);
  },
  decode(value) {
    try {
      return JSON.parse(value);
    } catch {
      return initialResume;
    }
  },
});


// Helper functions

export const updateBasics = (basics: Partial<Basics>) => {
  resume.set({
    ...resume.get(),
    basics: {
      ...resume.get().basics,
      ...basics
    }
  });
};

export const addProfile = (profile: Profile) => {
  resume.set({
    ...resume.get(),
    basics: {
      ...resume.get().basics,
      profiles: [...resume.get().basics.profiles, profile]
    }
  });
};

export const updateProfile = (index: number, profile: Partial<Profile>) => {
  const profiles = [...resume.get().basics.profiles];
  profiles[index] = { ...profiles[index], ...profile };
  resume.set({
    ...resume.get(),
    basics: {
      ...resume.get().basics,
      profiles
    }
  });
};

export const addWorkExperience = (work: Work) => {
  resume.set({
    ...resume.get(),
    work: [...resume.get().work, work]
  });
};

export const updateWorkExperience = (index: number, work: Partial<Work>) => {
  const workExperiences = [...resume.get().work];
  workExperiences[index] = { ...workExperiences[index], ...work };
  resume.set({
    ...resume.get(),
    work: workExperiences
  });
};


export const addVolunteerExperience = (volunteer: Volunteer) => {
  resume.set({
    ...resume.get(),
    volunteer: [...resume.get().volunteer, volunteer]
  });
};

export const updateVolunteerExperience = (index: number, volunteer: Partial<Volunteer>) => {
  const volunteerExperiences = [...resume.get().volunteer];
  volunteerExperiences[index] = { ...volunteerExperiences[index], ...volunteer };
  resume.set({
    ...resume.get(),
    volunteer: volunteerExperiences
  });
};

export const addEducation = (education: Education) => {
  resume.set({
    ...resume.get(),
    education: [...resume.get().education, education]
  });
};

export const updateEducation = (index: number, education: Partial<Education>) => {
  const educations = [...resume.get().education];
  educations[index] = { ...educations[index], ...education };
  resume.set({
    ...resume.get(),
    education: educations
  });
};

export const addAward = (award: Award) => {
  resume.set({
    ...resume.get(),
    awards: [...resume.get().awards, award]
  });
};

export const updateAward = (index: number, award: Partial<Award>) => {
  const awards = [...resume.get().awards];
  awards[index] = { ...awards[index], ...award };
  resume.set({
    ...resume.get(),
    awards
  });
};

export const addCertificate = (certificate: Certificate) => {
  resume.set({
    ...resume.get(),
    certificates: [...resume.get().certificates, certificate]
  });
};

export const updateCertificate = (index: number, certificate: Partial<Certificate>) => {
  const certificates = [...resume.get().certificates];
  certificates[index] = { ...certificates[index], ...certificate };
  resume.set({
    ...resume.get(),
    certificates
  });
};

export const addPublication = (publication: Publication) => {
  resume.set({
    ...resume.get(),
    publications: [...resume.get().publications, publication]
  });
};

export const updatePublication = (index: number, publication: Partial<Publication>) => {
  const publications = [...resume.get().publications];
  publications[index] = { ...publications[index], ...publication };
  resume.set({
    ...resume.get(),
    publications
  });
};

export const addSkill = (skill: Skill) => {
  resume.set({
    ...resume.get(),
    skills: [...resume.get().skills, skill]
  });
};

export const updateSkill = (index: number, skill: Partial<Skill>) => {
  const skills = [...resume.get().skills];
  skills[index] = { ...skills[index], ...skill };
  resume.set({
    ...resume.get(),
    skills
  });
};

export const addLanguage = (language: Language) => {
  resume.set({
    ...resume.get(),
    languages: [...resume.get().languages, language]
  });
};

export const updateLanguage = (index: number, language: Partial<Language>) => {
  const languages = [...resume.get().languages];
  languages[index] = { ...languages[index], ...language };
  resume.set({
    ...resume.get(),
    languages
  });
};

export const addInterest = (interest: Interest) => {
  resume.set({
    ...resume.get(),
    interests: [...resume.get().interests, interest]
  });
};

export const updateInterest = (index: number, interest: Partial<Interest>) => {
  const interests = [...resume.get().interests];
  interests[index] = { ...interests[index], ...interest };
  resume.set({
    ...resume.get(),
    interests
  });
};

export const addReference = (reference: Reference) => {
  resume.set({
    ...resume.get(),
    references: [...resume.get().references, reference]
  });
};

export const updateReference = (index: number, reference: Partial<Reference>) => {
  const references = [...resume.get().references];
  references[index] = { ...references[index], ...reference };
  resume.set({
    ...resume.get(),
    references
  });
};

export const addProject = (project: Project) => {
  resume.set({
    ...resume.get(),
    projects: [...resume.get().projects, project]
  });
};

export const updateProject = (index: number, project: Partial<Project>) => {
  const projects = [...resume.get().projects];
  projects[index] = { ...projects[index], ...project };
  resume.set({
    ...resume.get(),
    projects
  });
};