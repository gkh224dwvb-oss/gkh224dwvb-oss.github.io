/* =========================================================================
   SAA GROUP: clients
   This list feeds the "Our clients" band on the Home page and the client grid
   on the Services page (assets/js/clients.js draws them). If the list is ever
   emptied, both blocks hide themselves.

   Names are the companies' current names. The old saaest.com clients page
   showed several of them under their earlier names, which the Services grid
   shows as "Formerly ...".

   Every client shows as its name in SAA's display type until a logo file is
   added. To add a logo:
   1. Put the file in assets/img/clients/ (SVG is best; otherwise a PNG with a
      transparent background, at least 400 px wide). See README.txt there.
   2. Type the path between the quotes after logo: on that client's line, e.g.
        logo: 'assets/img/clients/adnoc.svg',
   3. Save the file and reload the page. If the file is missing, the name shows
      instead, so nothing ever breaks.

   To add a client, copy a line and change it. Keep the comma at the end of each line.
      name      The company's current name (read out by screen readers too).
      formerly  Optional. The earlier name, shown on the Services grid only.
      logo      Optional. Path to the logo file; '' shows the name instead.
      url       Optional. The company's website (https://...); '' for no link.
      invert    true: on the dark Home band the logo is shown in plain white
                and turns to full colour on hover (best for most logos).
                false: the logo keeps its colours on a light tile (for logos
                that sit inside a coloured box).
      scale     Optional, e.g. 1.15 or 0.9, if one logo looks too small or too
                big next to the others.
   ========================================================================= */
window.SAA_CLIENTS = [
  /* current manpower contracts (SA, 8 Oct 2026) */
  { name: 'ADNOC Drilling', formerly: '', logo: '', url: '', invert: true },
  { name: 'ADNOC Gas', formerly: 'GASCO', logo: '', url: '', invert: true },
  { name: 'ADNOC Distribution', formerly: '', logo: '', url: '', invert: true },
  { name: 'Ministry of Climate Change & Environment', formerly: '', logo: '', url: '', invert: true },
  { name: 'Al Ain City Municipality', formerly: '', logo: '', url: '', invert: true },
  { name: 'Abu Dhabi Municipality', formerly: '', logo: '', url: '', invert: true },
  { name: 'Emirates Transport', formerly: '', logo: '', url: '', invert: true },
  { name: 'SILAL Food & Technology', formerly: '', logo: '', url: '', invert: true },
  { name: 'LeasePlan', formerly: '', logo: 'assets/img/clients/leaseplan.png', url: '', invert: true, scale: 1.2 },
  { name: 'Awqaf', formerly: '', logo: '', url: '', invert: true },
  { name: 'DEWA', formerly: '', logo: '', url: '', invert: true },
  /* previous manpower contracts (SA, 8 Oct 2026) */
  { name: 'Abu Dhabi Agriculture & Food Safety Authority', formerly: '', logo: '', url: '', invert: true },
  { name: 'AD Ports Group', formerly: 'Abu Dhabi Ports Company', logo: '', url: '', invert: true },
  { name: 'Musanada', formerly: '', logo: '', url: '', invert: true },
  /* clients listed on the old saaest.com clients page */
  { name: 'ADNOC', formerly: '', logo: 'assets/img/clients/adnoc.png', url: '', invert: true, scale: 1.7 },
  { name: 'ADNOC Onshore', formerly: 'ADCO', logo: '', url: '', invert: true },
  { name: 'ADNOC Offshore', formerly: 'ZADCO', logo: '', url: '', invert: true },
  { name: 'ADNOC Refining', formerly: 'Takreer', logo: '', url: '', invert: true },
  { name: 'ADNOC Logistics & Services', formerly: 'Esnaad and Irshad', logo: '', url: '', invert: true },
  { name: 'Borouge', formerly: '', logo: 'assets/img/clients/borouge.png', url: '', invert: true, scale: 1.1 },
  { name: 'Fertiglobe', formerly: 'Fertil', logo: '', url: '', invert: true },
  { name: 'TotalEnergies', formerly: 'Total', logo: '', url: '', invert: true },
  { name: 'Khalifa University', formerly: 'The Petroleum Institute', logo: '', url: '', invert: true },
  { name: 'Aldar', formerly: '', logo: 'assets/img/clients/aldar.png', url: '', invert: true, scale: 1.6 },
  { name: 'Al-Futtaim', formerly: '', logo: 'assets/img/clients/al-futtaim.png', url: '', invert: true, scale: 1.6 },
  { name: 'Aabar Investments', formerly: '', logo: 'assets/img/clients/aabar.png', url: '', invert: true },
  { name: 'Massar', formerly: '', logo: 'assets/img/clients/massar.png', url: '', invert: true },
  { name: 'ADFERT', formerly: '', logo: 'assets/img/clients/adfert.png', url: '', invert: true, scale: 1.6 },
  { name: 'The Glenelg School of Abu Dhabi', formerly: '', logo: '', url: '', invert: true }
];
