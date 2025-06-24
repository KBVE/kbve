import ogImageSrc from "./images/social.png";

export const SITE = {
  title: "Meme.sh",
  tagline: "The best place for memes and viral content!",
  description: 'Meme.sh is your ultimate destination for discovering, creating, and sharing the funniest memes on the internet. Join our community of meme enthusiasts and creators.',
  description_short: 'Discover, create, and share the best memes on the internet with Meme.sh - your go-to meme community.',
  url: "https://meme.sh/",
  author: "Meme.sh Team",
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
