import ogImageSrc from "../images/social.png";

export const SITE = {
  title: "KiloByte Virtual Engine",
  tagline: "Top-quality Hardware, Guides, Tools, Tutorials!",
  description: 'KBVE offers an extensive range of premium hardware components, expert tutorials, and innovative game development services, including our own Steam games and mobile applications. Explore our offerings and contact our team for unmatched quality and creativity.',
  description_short: 'KBVE provides top-quality hardware components, comprehensive tutorials, and cutting-edge game development tailored to meet all your project needs.',
  url: "https://kbve.com/",
  author: "KBVE",
};

export const SEO = {
  title: SITE.title,
  description: SITE.description,
  structuredData: {
    "@context": "https://schema.org",
    "@type": "WebPage",
    inLanguage: "en-US",
    "@id": SITE.url,
    url: SITE.url,
    name: SITE.title,
    description: SITE.description,
    isPartOf: {
      "@type": "WebSite",
      url: SITE.url,
      name: SITE.title,
      description: SITE.description,
    },
  },
};

export const OG = {
  locale: "en_US",
  type: "website",
  url: SITE.url,
  title: `${SITE.title}: : DevTeam & Software Services`,
  description: "Equip your projects with KBVE's top-notch development team and software services. Specializing in machine learning, app design, development, and comprehensive hardware and backend solutions, KBVE is trusted by industry leaders. Discover simplicity, affordability, and reliability with our user-centric design and cutting-edge technology. Start exploring now!",
  image: ogImageSrc,
};
