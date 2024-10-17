
const navBarLinks = [
  { name: "Accueil", url: "/fr" },
  { name: "Produits", url: "/fr/products" },
  { name: "Arcade", url: "/fr/arcade"},
  { name: "Services", url: "/fr/services" },
  { name: "Docs", url:"/fr/welcome-to-docs/"},
  { name: "Blog", url: "/fr/blog" },
  { name: "Contact", url: "/fr/contact" },
];

const footerLinks = [
  {
    section: "Écosystème",
    links: [
      { name: "Documentation", url: "/fr/welcome-to-docs/" },
      { name: "Outils et Équipements", url: "/fr/products" },
      { name: "Services ", url: "/fr/services" },
    ],
  },
  {
    section: "Société",
    links: [
      { name: "À propos de nous", url: "#" },
      { name: "Blog", url: "/fr/blog" },
      { name: "Memes", url: "#" },
      { name: "Clients", url: "#" },
    ],
  },
];

const socialLinks = {
  facebook: "#",
  x: "#",
  github: "https://github.com/kbve/kbve",
  google: "#",
  slack: "#",
};

export default {
  navBarLinks,
  footerLinks,
  socialLinks,
};