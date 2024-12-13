// An array of links for navigation bar
const navBarLinks = [
  { name: "Home", url: "/" },
  { name: "Products", url: "/products/" },
  { name: "Arcade", url: "/arcade/" },
  { name: "Services", url: "/services/" },
  { name: "Docs", url: "/welcome-to-docs/" },
  { name: "Blog", url: "/blog/" },
  { name: "Contact", url: "/contact" },
];
// An array of links for footer
const footerLinks = [
  {
    section: "Ecosystem",
    links: [
      { name: "Documentation", url: "/welcome-to-docs/" },
      { name: "Products", url: "/products/" },
      { name: "Services", url: "/services" },
    ],
  },
  {
    section: "Company",
    links: [
      { name: "About us", url: "/about/" },
      { name: "Journal", url: "/journal/" },
      { name: "Tools", url: "/tools/" },
      { name: "Support", url: "/support/" },
    ],
  },
  {
    section: "Legal Documentation",
    links: [
      { name: "Legal", url: "/legal/" },
      { name: "Privacy", url: "/legal/privacy/" },
      { name: "EULA", url: "/legal/eula/" },
      { name: "Terms of Service", url: "/legal/tos/" },
      { name: "Disclaimer", url: "/legal/disclaimer/" }
    ],
  },
];
// An object of links for social icons
const socialLinks = {
  facebook: "https://www.facebook.com/",
  x: "https://twitter.com/h0lybyte",
  github: "https://github.com/kbve/kbve",
  google: "https://www.google.com/",
  slack: "https://slack.com/",
};

export default {
  navBarLinks,
  footerLinks,
  socialLinks,
};
